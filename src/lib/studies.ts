import {
  arrayRemove,
  arrayUnion,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  documentId,
  type Unsubscribe,
} from 'firebase/firestore';
import { deleteStudyPhotos } from '@/lib/photos';
import { deleteSessionNotes } from '@/lib/sessions';
import { getFirebase } from '@/lib/firebase';
import { normalizeTime } from '@/lib/guards';
import { upcomingSession, upcomingSessions } from '@/lib/format';
import { sortTags } from '@/lib/tags';
import { setSessionAttendance } from '@/lib/attendance';
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
  const day = draft.dayOfWeek;
  const skippedDates =
    draft.format === 'recurring' && day !== null
      ? draft.skippedDates.filter((date) => upcomingSessions(day, draft.time).includes(date))
      : [];
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
    isPublic: draft.isPublic,
    skippedDates,
    createdAt,
    updatedAt,
  };
}

async function syncStorageAccess(studyId: string): Promise<void> {
  const snap = await getDoc(studyRef(studyId));
  if (!snap.exists()) return;
  const data = snap.data();
  if (typeof data.hostId !== 'string' || !Array.isArray(data.approvedUserIds)) return;
  await setDoc(doc(getFirebase().db, 'studies', studyId, 'access', 'members'), {
    hostId: data.hostId,
    approvedUserIds: data.approvedUserIds.filter((uid) => typeof uid === 'string'),
  });
}

function privateFields(draft: StudyDraft, updatedAt: string) {
  return {
    exactAddress: draft.exactAddress.trim(),
    entryNotes: draft.entryNotes.trim(),
    updatedAt,
  };
}

export function subscribePublicStudies(
  onData: (studies: BibleStudy[]) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  const { db } = getFirebase();
  const studiesQuery = query(collection(db, 'studies'), where('isPublic', '==', true));
  return onSnapshot(
    studiesQuery,
    (snap) => {
      const studies: BibleStudy[] = [];
      snap.docs.forEach((item) => {
        const study = parseBibleStudy(item.id, item.data());
        if (study) studies.push(study);
      });
      studies.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      onData(studies);
    },
    (error) => onError(error),
  );
}

export async function markUnlistedStudiesPublic(): Promise<void> {
  const { db } = getFirebase();
  const snap = await getDocs(collection(db, 'studies'));
  await Promise.all(
    snap.docs.map(async (item) => {
      if (typeof item.data().isPublic === 'boolean') return;
      await updateDoc(item.ref, { isPublic: true });
    }),
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

export function subscribeApprovedStudies(
  uid: string,
  onData: (studies: BibleStudy[]) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  const { db } = getFirebase();
  const approved = query(collection(db, 'studies'), where('approvedUserIds', 'array-contains', uid));
  return onSnapshot(
    approved,
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

export function subscribeInvitedStudies(
  uid: string,
  onData: (studies: BibleStudy[]) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  const { db } = getFirebase();
  const invited = query(collection(db, 'studies'), where('invitedUserIds', 'array-contains', uid));
  return onSnapshot(
    invited,
    (snap) => {
      const studies: BibleStudy[] = [];
      snap.docs.forEach((item) => {
        const study = parseBibleStudy(item.id, item.data());
        if (study) studies.push(study);
      });
      studies.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      onData(studies);
    },
    (error) => onError(error),
  );
}

export async function inviteToStudy(studyId: string, uid: string): Promise<void> {
  await updateDoc(studyRef(studyId), {
    invitedUserIds: arrayUnion(uid),
    updatedAt: nowIso(),
  });
}

export async function revokeInvite(studyId: string, uid: string): Promise<void> {
  await updateDoc(studyRef(studyId), {
    invitedUserIds: arrayRemove(uid),
    updatedAt: nowIso(),
  });
}

export async function acceptInvite(study: BibleStudy, uid: string): Promise<void> {
  await writeMemberNotice(study.id, uid, 'accepted');
  try {
    await updateDoc(studyRef(study.id), {
      invitedUserIds: arrayRemove(uid),
      approvedUserIds: arrayUnion(uid),
      ...(study.pendingUserIds.includes(uid) ? { pendingUserIds: arrayRemove(uid) } : {}),
      updatedAt: nowIso(),
    });
    const firstSession = upcomingSession(study);
    if (firstSession) await setSessionAttendance(study.id, firstSession, uid, true, study.maxCapacity);
    await syncStorageAccess(study.id);
  } catch (error) {
    await deleteDoc(doc(getFirebase().db, 'studies', study.id, 'notices', uid)).catch(() => undefined);
    throw error;
  }
}

export async function declineInvite(studyId: string, uid: string): Promise<void> {
  await writeMemberNotice(studyId, uid, 'declined');
  try {
    await updateDoc(studyRef(studyId), {
      invitedUserIds: arrayRemove(uid),
      updatedAt: nowIso(),
    });
  } catch (error) {
    await deleteDoc(doc(getFirebase().db, 'studies', studyId, 'notices', uid)).catch(() => undefined);
    throw error;
  }
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
      invitedUserIds: [],
    });
    await setDoc(privateRef(ref.id), privateFields(draft, now));
    await syncStorageAccess(ref.id);
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
  await syncStorageAccess(studyId);
}

export async function setSessionCanceled(studyId: string, date: string, canceled: boolean): Promise<void> {
  await updateDoc(studyRef(studyId), {
    skippedDates: canceled ? arrayUnion(date) : arrayRemove(date),
    updatedAt: nowIso(),
  });
}

export async function loadCoHostIds(studyId: string): Promise<string[]> {
  const snapshot = await getDocs(collection(getFirebase().db, 'studies', studyId, 'managers'));
  return snapshot.docs.map((item) => item.id);
}

export async function deleteStudy(studyId: string): Promise<void> {
  const { db } = getFirebase();
  await deleteStudyPhotos(studyId);
  await deleteSessionNotes(studyId);
  const notices = await getDocs(collection(db, 'studies', studyId, 'notices'));
  await Promise.all(notices.docs.map((item) => deleteDoc(item.ref)));
  await deleteDoc(privateRef(studyId));
  await deleteDoc(doc(db, 'studies', studyId, 'access', 'members')).catch(() => undefined);
  await deleteDoc(studyRef(studyId));
}

export async function requestToJoin(studyId: string, uid: string): Promise<void> {
  const { db } = getFirebase();
  await deleteDoc(doc(db, 'studies', studyId, 'notices', uid)).catch(() => undefined);
  await updateDoc(studyRef(studyId), {
    pendingUserIds: arrayUnion(uid),
    updatedAt: nowIso(),
  });
}

export async function cancelRequest(studyId: string, uid: string): Promise<void> {
  await writeMemberNotice(studyId, uid, 'cancelled');
  try {
    await updateDoc(studyRef(studyId), {
      pendingUserIds: arrayRemove(uid),
      updatedAt: nowIso(),
    });
  } catch (error) {
    await deleteDoc(doc(getFirebase().db, 'studies', studyId, 'notices', uid)).catch(() => undefined);
    throw error;
  }
}

export async function leaveStudy(studyId: string, uid: string): Promise<void> {
  await writeMemberNotice(studyId, uid, 'left');
  try {
    await updateDoc(studyRef(studyId), {
      approvedUserIds: arrayRemove(uid),
      updatedAt: nowIso(),
    });
    await syncStorageAccess(studyId);
  } catch (error) {
    await deleteDoc(doc(getFirebase().db, 'studies', studyId, 'notices', uid)).catch(() => undefined);
    throw error;
  }
}

async function writeMemberNotice(
  studyId: string,
  uid: string,
  type: 'left' | 'cancelled' | 'accepted' | 'declined',
): Promise<void> {
  const { db } = getFirebase();
  await setDoc(doc(db, 'studies', studyId, 'notices', uid), {
    type,
    userId: uid,
    createdAt: nowIso(),
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
  const firstSession = upcomingSession(study);
  if (firstSession) await setSessionAttendance(study.id, firstSession, uid, true, study.maxCapacity);
  await syncStorageAccess(study.id);
}

export async function declineMember(studyId: string, uid: string): Promise<void> {
  await updateDoc(studyRef(studyId), {
    pendingUserIds: arrayRemove(uid),
    updatedAt: nowIso(),
  });
}

export async function removeMember(study: BibleStudy, uid: string): Promise<void> {
  const { db } = getFirebase();
  const notice = doc(db, 'studies', study.id, 'notices', uid);
  await setDoc(notice, {
    type: 'removed',
    userId: uid,
    studyTitle: study.title,
    hostName: study.hostName,
    createdAt: nowIso(),
  });
  try {
    await updateDoc(studyRef(study.id), {
      approvedUserIds: arrayRemove(uid),
      updatedAt: nowIso(),
    });
    await syncStorageAccess(study.id);
  } catch (error) {
    await deleteDoc(notice).catch(() => undefined);
    throw error;
  }
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
      phone: '',
      place: '',
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
    phone: profile.phone,
    place: [profile.neighbourhood, profile.city, profile.country].filter(Boolean).join(', '),
    status,
    profileMissing: false,
  };
}

export type HostNotice = {
  id: string;
  studyId: string;
  studyTitle: string;
  userId: string;
  fullName: string;
  photoURL: string;
  kind: 'request' | 'left' | 'cancelled' | 'accepted' | 'declined' | 'invite' | 'removed';
  at: string;
};

export function subscribeRemovalNotices(
  uid: string,
  onData: (notices: HostNotice[]) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  const { db } = getFirebase();
  const notices = query(collectionGroup(db, 'notices'), where('userId', '==', uid));
  return onSnapshot(
    notices,
    (snap) => {
      const next: HostNotice[] = [];
      snap.docs.forEach((item) => {
        const data = item.data();
        if (data.type !== 'removed' || data.userId !== uid || typeof data.createdAt !== 'string') return;
        const studyId = item.ref.parent.parent?.id;
        if (!studyId) return;
        next.push({
          id: `removed_${studyId}_${uid}`,
          studyId,
          studyTitle: typeof data.studyTitle === 'string' && data.studyTitle ? data.studyTitle : 'A study',
          userId: uid,
          fullName: typeof data.hostName === 'string' && data.hostName ? data.hostName : 'The host',
          photoURL: '',
          kind: 'removed',
          at: data.createdAt,
        });
      });
      next.sort((a, b) => b.at.localeCompare(a.at));
      onData(next);
    },
    (error) => onError(error),
  );
}

export async function loadJoinNotices(studies: BibleStudy[]): Promise<HostNotice[]> {
  const pending = studies
    .filter((study) => study.pendingUserIds.length > 0)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .flatMap((study) => study.pendingUserIds.map((uid) => ({ study, uid })));
  const profiles = await fetchProfiles([...new Set(pending.map((item) => item.uid))]);
  return pending.map(({ study, uid }) => {
    const profile = profiles.get(uid);
    return {
      id: `request_${study.id}_${uid}`,
      studyId: study.id,
      studyTitle: study.title,
      userId: uid,
      fullName: profile?.fullName || 'Someone',
      photoURL: profile?.photoURL ?? '',
      kind: 'request' as const,
      at: study.updatedAt,
    };
  });
}

export type DepartureRecord = {
  studyId: string;
  userId: string;
  createdAt: string;
  type: 'left' | 'cancelled' | 'accepted' | 'declined';
};

export function subscribeDepartures(
  studies: BibleStudy[],
  onData: (records: DepartureRecord[]) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  const { db } = getFirebase();
  if (studies.length === 0) {
    onData([]);
    return () => undefined;
  }
  const byStudy = new Map<string, DepartureRecord[]>();
  const unsubs = studies.map((study) =>
    onSnapshot(
      collection(db, 'studies', study.id, 'notices'),
      (snap) => {
        byStudy.set(
          study.id,
          snap.docs.flatMap((item) => {
            const data = item.data();
            const type =
              data.type === 'left' || data.type === 'cancelled' || data.type === 'accepted' || data.type === 'declined'
                ? data.type
                : null;
            if (!type || data.userId !== item.id || typeof data.createdAt !== 'string') return [];
            return [{ studyId: study.id, userId: item.id, createdAt: data.createdAt, type }];
          }),
        );
        onData(studies.flatMap((item) => byStudy.get(item.id) ?? []));
      },
      (error) => onError(error),
    ),
  );
  return () => {
    unsubs.forEach((unsubscribe) => unsubscribe());
  };
}

export async function loadDepartureNotices(
  studies: BibleStudy[],
  records: DepartureRecord[],
): Promise<HostNotice[]> {
  const titles = new Map(studies.map((study) => [study.id, study.title]));
  const profiles = await fetchProfiles([...new Set(records.map((record) => record.userId))]);
  return records.map((record) => {
    const profile = profiles.get(record.userId);
    return {
      id: `${record.type}_${record.studyId}_${record.userId}`,
      studyId: record.studyId,
      studyTitle: titles.get(record.studyId) ?? 'Your study',
      userId: record.userId,
      fullName: profile?.fullName || 'Someone',
      photoURL: profile?.photoURL ?? '',
      kind: record.type,
      at: record.createdAt,
    };
  });
}

export async function dismissDeparture(studyId: string, uid: string): Promise<void> {
  const { db } = getFirebase();
  await deleteDoc(doc(db, 'studies', studyId, 'notices', uid));
}

export async function loadPeople(studyId: string, uids: string[]): Promise<JoinRequest[]> {
  const profiles = await fetchProfiles(uids);
  return uids.map((uid) => toJoinRequest(studyId, uid, 'pending', profiles.get(uid)));
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
