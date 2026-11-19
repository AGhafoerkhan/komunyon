import {
  arrayRemove,
  arrayUnion,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  writeBatch,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getFirebase } from '@/lib/firebase';
import { actionError, firebaseErrorCode } from '@/lib/errors';
import { normalizeTime } from '@/lib/guards';
import { upcomingSession, upcomingSessions } from '@/lib/format';
import { sortTags } from '@/lib/tags';
import { setSessionAttendance } from '@/lib/attendance';
import { normalizePhone } from '@/lib/validate';
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
    showMemberContacts: draft.showMemberContacts,
    skippedDates,
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

async function writeMemberContact(studyId: string, uid: string, phone: string, place: string): Promise<void> {
  await setDoc(doc(getFirebase().db, 'studies', studyId, 'memberContacts', uid), {
    phone: normalizePhone(phone) ?? '',
    place: place.slice(0, 240),
    updatedAt: nowIso(),
  });
}

async function syncMemberContactFromPrivateProfile(studyId: string, uid: string): Promise<void> {
  const contact = await getDoc(doc(getFirebase().db, 'users', uid, 'private', 'contact'));
  if (!contact.exists()) return;
  const data = contact.data();
  const place = [data.neighbourhood, data.city, data.country]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(', ');
  await writeMemberContact(studyId, uid, typeof data.phone === 'string' ? data.phone : '', place);
}

type MemberStatus = 'pending' | 'approved' | 'invited';

function memberCollection(studyId: string) {
  return collection(getFirebase().db, 'studies', studyId, 'members');
}

async function hydrateStudy(study: BibleStudy, viewerUid: string): Promise<BibleStudy> {
  const { db } = getFirebase();
  const isHost = study.hostId === viewerUid;
  if (isHost) {
    const members = await getDocs(memberCollection(study.id));
    const byStatus: Record<MemberStatus, string[]> = { pending: [], approved: [], invited: [] };
    members.docs.forEach((item) => {
      const data = item.data();
      if (data.uid === item.id && typeof data.status === 'string' && Object.hasOwn(byStatus, data.status)) byStatus[data.status as MemberStatus].push(item.id);
    });
    if (members.empty && (study.pendingUserIds.length || study.approvedUserIds.length || study.invitedUserIds.length)) return study;
    return { ...study, pendingUserIds: byStatus.pending, approvedUserIds: byStatus.approved, invitedUserIds: byStatus.invited };
  }
  const ownSnapshot = await getDoc(doc(db, 'studies', study.id, 'members', viewerUid)).catch(() => null);
  const ownStatus = ownSnapshot?.exists() ? ownSnapshot.data().status as MemberStatus : null;
  if (study.hostId !== viewerUid && ownStatus !== 'approved') {
    return {
      ...study,
      pendingUserIds: ownStatus === 'pending' ? [viewerUid] : [],
      approvedUserIds: [],
      invitedUserIds: ownStatus === 'invited' ? [viewerUid] : [],
    };
  }
  const manager = ownStatus === 'approved'
    ? await getDoc(doc(db, 'studies', study.id, 'managers', viewerUid)).catch(() => null)
    : null;
  const canListAll = isHost || (manager?.exists() && manager.data().permissions?.canManageParticipants === true);
  const rosterQuery = canListAll
    ? memberCollection(study.id)
    : query(memberCollection(study.id), where('status', '==', 'approved'));
  const members = await getDocs(rosterQuery);
  if (members.empty && (study.pendingUserIds.length || study.approvedUserIds.length || study.invitedUserIds.length)) return study;
  const byStatus: Record<MemberStatus, string[]> = { pending: [], approved: [], invited: [] };
  members.docs.forEach((item) => {
    const data = item.data();
    if (data.uid === item.id && typeof data.status === 'string' && Object.hasOwn(byStatus, data.status)) byStatus[data.status as MemberStatus].push(item.id);
  });
  return {
    ...study,
    pendingUserIds: byStatus.pending,
    approvedUserIds: byStatus.approved,
    invitedUserIds: byStatus.invited,
  };
}

async function forwardStudyErrorUnlessDeleted(
  studyId: string,
  error: unknown,
  onError: (error: unknown) => void,
): Promise<void> {
  if (firebaseErrorCode(error) === 'permission-denied') {
    const snapshot = await getDoc(studyRef(studyId)).catch(() => null);
    if (snapshot && !snapshot.exists()) return;
  }
  onError(error);
}

async function performMembershipAction(studyId: string, action: string, targetUid?: string): Promise<void> {
  await httpsCallable(getFirebase().functions, 'changeStudyMembership')({ studyId, action, targetUid });
}

export function subscribePublicStudies(
  viewerUid: string,
  onData: (studies: BibleStudy[]) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  const { db } = getFirebase();
  const studiesQuery = query(collection(db, 'studies'), where('isPublic', '==', true));
  const memberQuery = query(collectionGroup(db, 'members'), where('uid', '==', viewerUid));
  let publicStudies: BibleStudy[] = [];
  let ownMemberships = new Map<string, string>();
  let studiesReady = false;
  let membersReady = false;
  const publish = () => {
    if (!studiesReady || !membersReady) return;
    const studies = publicStudies.map((study) => {
      const status = ownMemberships.get(study.id);
      return {
        ...study,
        pendingUserIds: status === 'pending' ? [viewerUid] : study.pendingUserIds,
        approvedUserIds: status === 'approved' ? [viewerUid] : study.approvedUserIds,
        invitedUserIds: status === 'invited' ? [viewerUid] : study.invitedUserIds,
      };
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    onData(studies);
  };
  const stopStudies = onSnapshot(studiesQuery, (snap) => {
    publicStudies = snap.docs.flatMap((item) => {
      const study = parseBibleStudy(item.id, item.data());
      return study ? [study] : [];
    });
    studiesReady = true;
    publish();
  }, onError);
  const stopMembers = onSnapshot(memberQuery, (snap) => {
    ownMemberships = new Map(snap.docs.flatMap((item) => {
      const data = item.data();
      const studyId = item.ref.parent.parent?.id;
      return studyId && typeof data.status === 'string' ? [[studyId, data.status]] : [];
    }));
    membersReady = true;
    publish();
  }, onError);
  return () => { stopStudies(); stopMembers(); };
}

export async function markUnlistedStudiesPublic(): Promise<void> {
  const { db } = getFirebase();
  const snap = await getDocs(query(collection(db, 'studies'), where('hostId', '==', getFirebase().auth.currentUser?.uid ?? '')));
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
  let active = true;
  let revision = 0;
  let currentIds = new Set<string>();
  const stop = onSnapshot(
    hosted,
    (snap) => {
      const currentRevision = ++revision;
      currentIds = new Set(snap.docs.map((item) => item.id));
      void Promise.all(snap.docs.map(async (item) => {
        const study = parseBibleStudy(item.id, item.data());
        if (!study) return null;
        try {
          return await hydrateStudy(study, uid);
        } catch (error) {
          if (active && currentIds.has(study.id)) {
            await forwardStudyErrorUnlessDeleted(study.id, error, (failure) => {
              if (active && currentIds.has(study.id)) onError(failure);
            });
          }
          return null;
        }
      })).then((studies) => {
        if (!active || currentRevision !== revision) return;
        onData(studies.filter((study): study is BibleStudy => study !== null));
      });
    },
    (error) => { if (active) onError(error); },
  );
  return () => {
    active = false;
    stop();
  };
}

function subscribeMembershipStudies(
  uid: string,
  statuses: MemberStatus[],
  onData: (studies: BibleStudy[]) => void,
  onError: (error: unknown) => void,
  requiredPermission?: 'canManageParticipants',
): Unsubscribe {
  const { db } = getFirebase();
  const membershipQuery = query(collectionGroup(db, 'members'), where('uid', '==', uid));
  const active = new Map<string, { stops: Unsubscribe[]; study: BibleStudy | null; managerAllowed: boolean }>();
  const publish = () => onData([...active.values()].flatMap((entry) => entry.study && entry.managerAllowed ? [entry.study] : []));
  const stopMemberships = onSnapshot(membershipQuery, (snapshot) => {
    const matching = new Set(snapshot.docs.flatMap((item) => {
      const data = item.data();
      const studyId = item.ref.parent.parent?.id;
      return studyId && data.uid === uid && statuses.includes(data.status as MemberStatus) ? [studyId] : [];
    }));
    for (const [studyId, entry] of active) {
      if (matching.has(studyId)) continue;
      entry.stops.forEach((stop) => stop());
      active.delete(studyId);
    }
    for (const studyId of matching) {
      if (active.has(studyId)) continue;
      const entry = { stops: [] as Unsubscribe[], study: null as BibleStudy | null, managerAllowed: !requiredPermission };
      active.set(studyId, entry);
      const reportIfCurrent = (error: unknown) => {
        void forwardStudyErrorUnlessDeleted(studyId, error, (failure) => {
          if (active.get(studyId) === entry) onError(failure);
        });
      };
      entry.stops.push(onSnapshot(doc(db, 'studies', studyId), (studySnapshot) => {
        if (active.get(studyId) !== entry) return;
        const base = studySnapshot.exists() ? parseBibleStudy(studySnapshot.id, studySnapshot.data()) : null;
        void (base ? hydrateStudy(base, uid) : Promise.resolve(null)).then((study) => {
          if (active.get(studyId) !== entry) return;
          entry.study = study;
          publish();
        }).catch((error) => {
          if (active.get(studyId) === entry) reportIfCurrent(error);
        });
      }, (error) => {
        if (active.get(studyId) === entry) reportIfCurrent(error);
      }));
      if (requiredPermission) {
        entry.stops.push(onSnapshot(doc(db, 'studies', studyId, 'managers', uid), (managerSnapshot) => {
          if (active.get(studyId) !== entry) return;
          entry.managerAllowed = managerSnapshot.exists()
            && managerSnapshot.data().permissions?.[requiredPermission] === true;
          publish();
        }, (error) => {
          if (active.get(studyId) === entry) reportIfCurrent(error);
        }));
      }
    }
    publish();
  }, onError);
  return () => {
    stopMemberships();
    active.forEach((entry) => entry.stops.forEach((stop) => stop()));
    active.clear();
  };
}

export function subscribeParticipantManagedStudies(
  uid: string,
  onData: (studies: BibleStudy[]) => void,
  onError: (error: unknown) => void,
) {
  return subscribeMembershipStudies(uid, ['approved'], onData, onError, 'canManageParticipants');
}

export function subscribeApprovedStudies(
  uid: string,
  onData: (studies: BibleStudy[]) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  return subscribeMembershipStudies(uid, ['approved'], onData, onError);
}

export function subscribeInvitedStudies(
  uid: string,
  onData: (studies: BibleStudy[]) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  return subscribeMembershipStudies(uid, ['invited'], onData, onError);
}

export async function inviteToStudy(studyId: string, uid: string): Promise<void> {
  await performMembershipAction(studyId, 'invite', uid);
}

export async function revokeInvite(studyId: string, uid: string): Promise<void> {
  await performMembershipAction(studyId, 'revoke-invite', uid);
}

export async function acceptInvite(study: BibleStudy, uid: string): Promise<void> {
  if (study.approvedUserIds.includes(uid)) return;
  if (!study.invitedUserIds.includes(uid)) throw new Error('This invitation is no longer available.');
  await syncMemberContactFromPrivateProfile(study.id, uid).catch(() => undefined);
  await performMembershipAction(study.id, 'accept-invite');
  const firstSession = upcomingSession(study);
  if (!firstSession) return;
  try {
    await setSessionAttendance(study.id, firstSession, uid, true, study.maxCapacity);
  } catch (failure) {
    const code = typeof failure === 'object' && failure !== null && 'code' in failure
      ? String(failure.code)
      : '';
    // Accepting an invitation grants study access even when the first session is full.
    if (code !== 'functions/resource-exhausted' && code !== 'resource-exhausted') {
      actionError(failure, {
        action: 'accept study invitation',
        operation: 'set default attendance for the first session after acceptance',
        target: `studies/${study.id}/sessions/${firstSession}`,
      });
    }
  }
}

export async function declineInvite(studyId: string, uid: string): Promise<void> {
  await performMembershipAction(studyId, 'decline-invite');
}

export function subscribeStudy(
  studyId: string,
  onData: (study: BibleStudy | null) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  const { auth, db } = getFirebase();
  const uid = auth.currentUser?.uid;
  let base: BibleStudy | null = null;
  let ownStatus: MemberStatus | null = null;
  let roster: Record<MemberStatus, string[]> | null = null;
  let stopRoster: Unsubscribe | null = null;
  let managerCanManage = false;
  let stopManager: Unsubscribe | null = null;
  const publish = () => {
    if (!base) { onData(null); return; }
    if (roster) {
      onData({ ...base, pendingUserIds: roster.pending, approvedUserIds: roster.approved, invitedUserIds: roster.invited });
      return;
    }
    onData({
      ...base,
      pendingUserIds: ownStatus === 'pending' ? [uid!] : base.pendingUserIds,
      approvedUserIds: ownStatus === 'approved' ? [uid!] : base.approvedUserIds,
      invitedUserIds: ownStatus === 'invited' ? [uid!] : base.invitedUserIds,
    });
  };
  const bindManager = () => {
    const eligible = Boolean(uid && ownStatus === 'approved' && base && base.hostId !== uid);
    if (eligible && !stopManager) {
      stopManager = onSnapshot(doc(db, 'studies', studyId, 'managers', uid!), (snapshot) => {
        const nextPermission = snapshot.exists() && snapshot.data().permissions?.canManageParticipants === true;
        if (managerCanManage !== nextPermission && stopRoster) {
          stopRoster();
          stopRoster = null;
          roster = null;
        }
        managerCanManage = nextPermission;
        bindRoster(Boolean(base && uid && base.hostId === uid) || ownStatus === 'approved');
      }, () => {
        managerCanManage = false;
        if (stopRoster) { stopRoster(); stopRoster = null; roster = null; }
      });
    } else if (!eligible && stopManager) {
      stopManager();
      stopManager = null;
      managerCanManage = false;
    }
  };
  const bindRoster = (allowed: boolean) => {
    if (allowed && !stopRoster) {
      const host = Boolean(base && uid && base.hostId === uid);
      const rosterQuery = host || managerCanManage
        ? memberCollection(studyId)
        : query(memberCollection(studyId), where('status', '==', 'approved'));
      stopRoster = onSnapshot(rosterQuery, (snapshot) => {
        const next: Record<MemberStatus, string[]> = { pending: [], approved: [], invited: [] };
        snapshot.docs.forEach((item) => {
          const data = item.data();
          if (data.uid === item.id && typeof data.status === 'string' && Object.hasOwn(next, data.status)) {
            next[data.status as MemberStatus].push(item.id);
          }
        });
        roster = next;
        publish();
      }, (error) => {
        roster = null;
        onError(error);
      });
    } else if (!allowed && stopRoster) {
      stopRoster();
      stopRoster = null;
      roster = null;
      publish();
    }
  };
  const stopStudy = onSnapshot(studyRef(studyId), (snapshot) => {
    base = snapshot.exists() ? parseBibleStudy(snapshot.id, snapshot.data()) : null;
    bindManager();
    bindRoster(Boolean(base && uid && base.hostId === uid) || ownStatus === 'approved');
    publish();
  }, onError);
  const stopOwn = uid ? onSnapshot(doc(db, 'studies', studyId, 'members', uid), (snapshot) => {
    ownStatus = snapshot.exists() ? snapshot.data().status as MemberStatus : null;
    bindManager();
    bindRoster(Boolean(base && uid && base.hostId === uid) || ownStatus === 'approved');
    publish();
  }, () => { ownStatus = null; publish(); }) : () => undefined;
  return () => { stopStudy(); stopOwn(); stopRoster?.(); stopManager?.(); };
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
  const study = parseBibleStudy(snap.id, snap.data());
  const uid = getFirebase().auth.currentUser?.uid;
  return study && uid ? hydrateStudy(study, uid) : study;
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
  let failedOperation = 'write public event document';
  let failedTarget = `studies/${ref.id}`;
  try {
    await setDoc(ref, {
      ...publicFields(host, draft, now, now),
      approvedCount: 0,
      skippedDates: [],
    });
    failedOperation = 'write private address and entry notes';
    failedTarget = `studies/${ref.id}/private/details`;
    const dates = draft.format === 'recurring' && draft.dayOfWeek !== null
      ? upcomingSessions(draft.dayOfWeek, draft.time, 8)
      : draft.date
        ? [draft.date]
        : [];
    const setup = await Promise.allSettled([
      setDoc(privateRef(ref.id), privateFields(draft, now)),
      httpsCallable(getFirebase().functions, 'initializeHostedStudySessions')({ studyId: ref.id, dates }),
      writeMemberContact(ref.id, host.uid, host.phone, [host.neighbourhood, host.city, host.country].filter(Boolean).join(', ')),
    ]);
    const failedIndex = setup.findIndex((result) => result.status === 'rejected');
    if (failedIndex !== -1) {
      const failedOperations = [
        ['write private address and entry notes', `studies/${ref.id}/private/details`],
        ['initialize host attendance', `studies/${ref.id}/sessions/*/attendees/${host.uid}`],
        ['write host contact for group members', `studies/${ref.id}/memberContacts/${host.uid}`],
      ] as const;
      [failedOperation, failedTarget] = failedOperations[failedIndex];
      throw (setup[failedIndex] as PromiseRejectedResult).reason;
    }
  } catch (error) {
    await httpsCallable(getFirebase().functions, 'deleteHostedStudy')({ studyId: ref.id }).catch(() => undefined);
    const failure = new Error(error instanceof Error ? error.message : 'Event creation failed.', { cause: error });
    failure.name = 'StudyCreationError';
    Object.assign(failure, {
      code: firebaseErrorCode(error) ?? '',
      rawError: error,
      issueContext: {
        action: 'host an event',
        operation: failedOperation,
        target: failedTarget,
      },
    });
    throw failure;
  }
  return ref.id;
}

export async function updateStudy(studyId: string, host: UserProfile, draft: StudyDraft, createdAt: string): Promise<void> {
  if (typeof createdAt !== 'string') throw new Error('This study could not be updated.');
  const now = nowIso();
  const batch = writeBatch(getFirebase().db);
  batch.update(studyRef(studyId), publicFields(host, draft, createdAt, now));
  batch.set(privateRef(studyId), privateFields(draft, now));
  await batch.commit();
}

export async function setMemberContactVisibility(studyId: string, visible: boolean): Promise<void> {
  await updateDoc(studyRef(studyId), { showMemberContacts: visible, updatedAt: nowIso() });
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

export function subscribeCoHostIds(studyId: string, onData: (ids: string[]) => void, onError: (error: unknown) => void): Unsubscribe {
  return onSnapshot(
    collection(getFirebase().db, 'studies', studyId, 'managers'),
    (snapshot) => onData(snapshot.docs.map((item) => item.id)),
    onError,
  );
}

export async function loadCoHostEditPermission(studyId: string, uid: string): Promise<boolean> {
  const snapshot = await getDoc(doc(getFirebase().db, 'studies', studyId, 'managers', uid));
  return snapshot.exists() && snapshot.data().permissions?.canEdit === true;
}

export function subscribeCoHostEditPermission(
  studyId: string,
  uid: string,
  onData: (canEdit: boolean) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    doc(getFirebase().db, 'studies', studyId, 'managers', uid),
    (snapshot) => onData(snapshot.exists() && snapshot.data().permissions?.canEdit === true),
    onError,
  );
}

export function subscribeCoHostParticipantPermission(
  studyId: string,
  uid: string,
  onData: (canManage: boolean) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    doc(getFirebase().db, 'studies', studyId, 'managers', uid),
    (snapshot) => onData(snapshot.exists() && snapshot.data().permissions?.canManageParticipants === true),
    onError,
  );
}

export function subscribeCoHostManagerPermission(
  studyId: string,
  uid: string,
  onData: (allowed: boolean) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    doc(getFirebase().db, 'studies', studyId, 'managers', uid),
    (snapshot) => onData(snapshot.exists() && snapshot.data().permissions?.canManageCoHosts === true),
    onError,
  );
}

export function subscribeCoHostPermissionManagerPermission(studyId: string, uid: string, onData: (allowed: boolean) => void, onError: (error: unknown) => void): Unsubscribe {
  return onSnapshot(doc(getFirebase().db, 'studies', studyId, 'managers', uid), (snapshot) => onData(snapshot.exists() && snapshot.data().permissions?.canManageCoHostPermissions === true), onError);
}

export function subscribeCoHostSessionPermission(studyId: string, uid: string, onData: (allowed: boolean) => void, onError: (error: unknown) => void): Unsubscribe {
  return onSnapshot(doc(getFirebase().db, 'studies', studyId, 'managers', uid), (snapshot) => onData(snapshot.exists() && snapshot.data().permissions?.canManageSessions === true), onError);
}

export async function deleteStudy(studyId: string): Promise<void> {
  const { functions } = getFirebase();
  await httpsCallable(functions, 'deleteHostedStudy')({ studyId });
}

export async function requestToJoin(studyId: string, uid: string): Promise<void> {
  await performMembershipAction(studyId, 'request');
  await syncMemberContactFromPrivateProfile(studyId, uid).catch(() => undefined);
}

export async function cancelRequest(studyId: string, uid: string): Promise<void> {
  await performMembershipAction(studyId, 'cancel-request');
}

export async function leaveStudy(studyId: string, uid: string): Promise<void> {
  await performMembershipAction(studyId, 'leave');
}

export async function approveMember(study: BibleStudy, uid: string): Promise<void> {
  if (!study.pendingUserIds.includes(uid)) {
    throw new Error('That request is no longer pending.');
  }
  await performMembershipAction(study.id, 'approve', uid);
  const firstSession = upcomingSession(study);
  if (firstSession) await setSessionAttendance(study.id, firstSession, uid, true, study.maxCapacity);
}

export async function declineMember(studyId: string, uid: string): Promise<void> {
  await performMembershipAction(studyId, 'decline', uid);
}

export async function removeMember(study: BibleStudy, uid: string, actorName = study.hostName): Promise<void> {
  void actorName;
  await performMembershipAction(study.id, 'remove', uid);
}

async function fetchProfiles(uids: string[]): Promise<Map<string, UserProfile>> {
  const profiles = new Map<string, UserProfile>();
  if (uids.length === 0) return profiles;
  const { db } = getFirebase();
  for (let index = 0; index < uids.length; index += 10) {
    const chunk = uids.slice(index, index + 10);
    const snap = await getDocs(query(collection(db, 'users'), where('publicProfile', '==', true), where(documentId(), 'in', chunk)));
    snap.docs.forEach((item) => {
      const profile = parseUserProfile(item.id, item.data());
      if (profile) profiles.set(profile.uid, profile);
    });
  }
  return profiles;
}

async function fetchMemberContacts(studyId: string, uids: string[]): Promise<Map<string, { phone: string; place: string }>> {
  const contacts = new Map<string, { phone: string; place: string }>();
  if (uids.length === 0) return contacts;
  const { db } = getFirebase();
  const snapshots = await Promise.all(
    uids.map((uid) => getDoc(doc(db, 'studies', studyId, 'memberContacts', uid)).catch(() => null)),
  );
  snapshots.forEach((item) => {
    if (!item?.exists()) return;
    const data = item.data();
    contacts.set(item.id, {
      phone: typeof data.phone === 'string' ? data.phone : '',
      place: typeof data.place === 'string' ? data.place : '',
    });
  });
  return contacts;
}

export async function syncOwnMemberContact(study: BibleStudy, profile: UserProfile): Promise<void> {
  if (study.hostId !== profile.uid && !study.approvedUserIds.includes(profile.uid)) return;
  await writeMemberContact(study.id, profile.uid, profile.phone, [profile.neighbourhood, profile.city, profile.country].filter(Boolean).join(', '));
}

function toJoinRequest(
  studyId: string,
  uid: string,
  status: 'pending' | 'approved',
  profile: UserProfile | undefined,
  contact?: { phone: string; place: string },
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
    phone: contact?.phone ?? '',
    place: contact?.place ?? '',
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

export async function loadPeople(
  studyId: string,
  uids: string[],
  includeContacts = false,
  status: 'pending' | 'approved' = 'approved',
): Promise<JoinRequest[]> {
  const profiles = await fetchProfiles(uids);
  const contacts = includeContacts ? await fetchMemberContacts(studyId, uids) : new Map();
  return uids.map((uid) => toJoinRequest(studyId, uid, status, profiles.get(uid), contacts.get(uid)));
}

export async function loadStudyMemberships(uid: string): Promise<Array<{ studyId: string; status: MemberStatus }>> {
  const snapshot = await getDocs(query(collectionGroup(getFirebase().db, 'members'), where('uid', '==', uid)));
  return snapshot.docs.flatMap((item) => {
    const data = item.data();
    const studyId = item.ref.parent.parent?.id;
    if (!studyId || data.uid !== uid || typeof data.status !== 'string' || !Object.hasOwn({ pending: 1, approved: 1, invited: 1 }, data.status)) return [];
    return [{ studyId, status: data.status as MemberStatus }];
  });
}

export async function loadJoinRequests(study: BibleStudy, includeContacts = false): Promise<{
  pending: JoinRequest[];
  approved: JoinRequest[];
}> {
  const ids = [...new Set([...study.pendingUserIds, ...study.approvedUserIds])];
  const profiles = await fetchProfiles(ids);
  const contacts = includeContacts ? await fetchMemberContacts(study.id, study.approvedUserIds) : new Map();
  return {
    pending: study.pendingUserIds.map((uid) => toJoinRequest(study.id, uid, 'pending', profiles.get(uid))),
    approved: study.approvedUserIds.map((uid) => toJoinRequest(study.id, uid, 'approved', profiles.get(uid), contacts.get(uid))),
  };
}
