import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  documentId,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase';
import { normalizeTime } from '@/lib/guards';
import { sortTags } from '@/lib/tags';
import { parseBibleStudy, parsePrivateDetails, parseUserProfile } from '@/lib/parse';
import type { BibleStudy, JoinRequest, PrivateStudyDetails, StudyDraft, UserProfile } from '@/types';

function nowIso(): string {
  return new Date().toISOString();
}

function studyRef(studyId: string) {
  const { db } = getFirebase();
  return doc(db, 'studies', studyId);
}

function privateRef(studyId: string) {
  const { db } = getFirebase();
  return doc(db, 'studies', studyId, 'private', 'details');
}

function publicFields(host: UserProfile, draft: StudyDraft, createdAt: string, updatedAt: string) {
  return {
    hostId: host.uid,
    hostName: host.fullName,
    hostAge: host.age,
    hostPhotoURL: host.photoURL,
    title: draft.title.trim(),
    description: draft.description.trim(),
    tags: sortTags(draft.tags),
    format: draft.format,
    dayOfWeek: draft.format === 'recurring' ? draft.dayOfWeek : null,
    date: draft.format === 'one-off' ? draft.date : null,
    time: normalizeTime(draft.time) ?? draft.time,
    maxCapacity: draft.maxCapacity,
    area: draft.area,
    createdAt,
    updatedAt,
  };
}

function privateFields(draft: StudyDraft, updatedAt: string) {
  return {
    exactAddress: draft.exactAddress.trim(),
    entryNotes: draft.entryNotes.trim(),
    updatedAt,
  };
}

export function subscribeStudies(
  onData: (studies: BibleStudy[]) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  const { db } = getFirebase();
  const studiesQuery = query(collection(db, 'studies'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    studiesQuery,
    (snap) => {
      const studies: BibleStudy[] = [];
      snap.docs.forEach((item) => {
        const study = parseBibleStudy(item.id, item.data());
        if (study) studies.push(study);
      });
      onData(studies);
    },
    (error) => onError(error),
  );
}

export function subscribeHostedStudies(
  uid: string,
  onData: (studies: BibleStudy[]) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  const { db } = getFirebase();
  const hosted = query(collection(db, 'studies'), where('hostId', '==', uid));
  return onSnapshot(
    hosted,
    (snap) => {
      const studies: BibleStudy[] = [];
      snap.docs.forEach((item) => {
        const study = parseBibleStudy(item.id, item.data());
        if (study) studies.push(study);
      });
      onData(studies);
    },
    (error) => onError(error),
  );
}

export function subscribeStudy(
  studyId: string,
  onData: (study: BibleStudy | null) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    studyRef(studyId),
    (snap) => {
      onData(snap.exists() ? parseBibleStudy(snap.id, snap.data()) : null);
    },
    (error) => onError(error),
  );
}

export function subscribePrivateDetails(
  studyId: string,
  onData: (details: PrivateStudyDetails | null) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    privateRef(studyId),
    (snap) => {
      onData(snap.exists() ? parsePrivateDetails(snap.data()) : null);
    },
    (error) => onError(error),
  );
}

export async function getStudy(studyId: string): Promise<BibleStudy | null> {
  const snap = await getDoc(studyRef(studyId));
  if (!snap.exists()) return null;
  return parseBibleStudy(snap.id, snap.data());
}

export async function getPrivateDetails(studyId: string): Promise<PrivateStudyDetails | null> {
  const snap = await getDoc(privateRef(studyId));
  if (!snap.exists()) return null;
  return parsePrivateDetails(snap.data());
}

export async function createStudy(host: UserProfile, draft: StudyDraft): Promise<string> {
  const { db } = getFirebase();
  const ref = doc(collection(db, 'studies'));
  const now = nowIso();
  try {
    await setDoc(ref, {
      ...publicFields(host, draft, now, now),
      pendingUserIds: [],
      approvedUserIds: [],
    });
    await setDoc(privateRef(ref.id), privateFields(draft, now));
  } catch (error) {
    await deleteDoc(ref).catch(() => undefined);
    throw error;
  }
  return ref.id;
}

export async function updateStudy(studyId: string, host: UserProfile, draft: StudyDraft): Promise<void> {
  const existing = await getDoc(studyRef(studyId));
  if (!existing.exists()) throw new Error('This study no longer exists.');
  const createdAt = existing.data().createdAt;
  if (typeof createdAt !== 'string') throw new Error('This study could not be updated.');
  const now = nowIso();
  await updateDoc(studyRef(studyId), publicFields(host, draft, createdAt, now));
  await setDoc(privateRef(studyId), privateFields(draft, now));
}

export async function deleteStudy(studyId: string): Promise<void> {
  await deleteDoc(privateRef(studyId));
  await deleteDoc(studyRef(studyId));
}

export async function requestToJoin(studyId: string, uid: string): Promise<void> {
  await updateDoc(studyRef(studyId), {
    pendingUserIds: arrayUnion(uid),
    updatedAt: nowIso(),
  });
}

export async function cancelRequest(studyId: string, uid: string): Promise<void> {
  await updateDoc(studyRef(studyId), {
    pendingUserIds: arrayRemove(uid),
    updatedAt: nowIso(),
  });
}

export async function leaveStudy(studyId: string, uid: string): Promise<void> {
  await updateDoc(studyRef(studyId), {
    approvedUserIds: arrayRemove(uid),
    updatedAt: nowIso(),
  });
}

export async function approveMember(study: BibleStudy, uid: string): Promise<void> {
  if (study.approvedUserIds.length >= study.maxCapacity) {
    throw new Error('This study is full.');
  }
  if (!study.pendingUserIds.includes(uid)) {
    throw new Error('That request is no longer pending.');
  }
  await updateDoc(studyRef(study.id), {
    pendingUserIds: arrayRemove(uid),
    approvedUserIds: arrayUnion(uid),
    updatedAt: nowIso(),
  });
}

export async function declineMember(studyId: string, uid: string): Promise<void> {
  await updateDoc(studyRef(studyId), {
    pendingUserIds: arrayRemove(uid),
    updatedAt: nowIso(),
  });
}

export async function removeMember(studyId: string, uid: string): Promise<void> {
  await updateDoc(studyRef(studyId), {
    approvedUserIds: arrayRemove(uid),
    updatedAt: nowIso(),
  });
}

async function fetchProfiles(uids: string[]): Promise<Map<string, UserProfile>> {
  const profiles = new Map<string, UserProfile>();
  if (uids.length === 0) return profiles;
  const { db } = getFirebase();
  for (let index = 0; index < uids.length; index += 10) {
    const chunk = uids.slice(index, index + 10);
    const snap = await getDocs(query(collection(db, 'users'), where(documentId(), 'in', chunk)));
    snap.docs.forEach((item) => {
      const profile = parseUserProfile(item.id, item.data());
      if (profile) profiles.set(profile.uid, profile);
    });
  }
  return profiles;
}

function toJoinRequest(
  studyId: string,
  uid: string,
  status: 'pending' | 'approved',
  profile: UserProfile | undefined,
): JoinRequest {
  if (!profile) {
    return {
      id: `${studyId}_${uid}`,
      studyId,
      userId: uid,
      fullName: 'Profile unavailable',
      age: 0,
      photoURL: '',
      bio: '',
      status,
      profileMissing: true,
    };
  }
  return {
    id: `${studyId}_${uid}`,
    studyId,
    userId: uid,
    fullName: profile.fullName,
    age: profile.age,
    photoURL: profile.photoURL,
    bio: profile.bio,
    status,
    profileMissing: false,
  };
}

export type JoinNotice = {
  id: string;
  studyId: string;
  studyTitle: string;
  fullName: string;
  photoURL: string;
};

export async function loadJoinNotices(studies: BibleStudy[]): Promise<JoinNotice[]> {
  const pending = studies
    .filter((study) => study.pendingUserIds.length > 0)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .flatMap((study) => study.pendingUserIds.map((uid) => ({ study, uid })));
  const profiles = await fetchProfiles([...new Set(pending.map((item) => item.uid))]);
  return pending.map(({ study, uid }) => {
    const profile = profiles.get(uid);
    return {
      id: `${study.id}_${uid}`,
      studyId: study.id,
      studyTitle: study.title,
      fullName: profile?.fullName || 'Someone',
      photoURL: profile?.photoURL ?? '',
    };
  });
}

export async function loadJoinRequests(study: BibleStudy): Promise<{
  pending: JoinRequest[];
  approved: JoinRequest[];
}> {
  const ids = [...new Set([...study.pendingUserIds, ...study.approvedUserIds])];
  const profiles = await fetchProfiles(ids);
  return {
    pending: study.pendingUserIds.map((uid) => toJoinRequest(study.id, uid, 'pending', profiles.get(uid))),
    approved: study.approvedUserIds.map((uid) => toJoinRequest(study.id, uid, 'approved', profiles.get(uid))),
  };
}
