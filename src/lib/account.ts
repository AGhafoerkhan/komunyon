import { deleteUser, type User } from 'firebase/auth';
import { collection, deleteDoc, doc, getDocs, query, where } from 'firebase/firestore';
import { firebaseErrorCode } from '@/lib/errors';
import { getFirebase, reauthenticateGoogleAccount } from '@/lib/firebase';
import { deleteProfilePhoto } from '@/lib/photos';
import { cancelRequest, declineInvite, deleteStudy, leaveStudy } from '@/lib/studies';

const DELETE_ACCOUNT_KEY = 'komunyon-delete-account';
let deletionClaimed = false;

export function claimAccountDeletion(): boolean {
  if (sessionStorage.getItem(DELETE_ACCOUNT_KEY) !== '1' || deletionClaimed) return false;
  deletionClaimed = true;
  sessionStorage.removeItem(DELETE_ACCOUNT_KEY);
  return true;
}

function rememberAccountDeletion(): void {
  deletionClaimed = false;
  sessionStorage.setItem(DELETE_ACCOUNT_KEY, '1');
}

async function studyIds(field: string, uid: string, match: 'equal' | 'contains'): Promise<string[]> {
  const { db } = getFirebase();
  const snap = await getDocs(
    query(collection(db, 'studies'), where(field, match === 'equal' ? '==' : 'array-contains', uid)),
  );
  return snap.docs.map((item) => item.id);
}

async function wipeAccount(user: User): Promise<void> {
  const uid = user.uid;
  const hosted = await studyIds('hostId', uid, 'equal');
  for (const studyId of hosted) await deleteStudy(studyId);

  const [approved, invited] = await Promise.all([
    studyIds('approvedUserIds', uid, 'contains'),
    studyIds('invitedUserIds', uid, 'contains'),
  ]);
  let pending: string[] = [];
  try {
    pending = await studyIds('pendingUserIds', uid, 'contains');
  } catch (error) {
    const code = firebaseErrorCode(error);
    if (code !== 'permission-denied' && code !== 'firestore/permission-denied') throw error;
  }
  for (const studyId of approved) await leaveStudy(studyId, uid);
  for (const studyId of invited) await declineInvite(studyId, uid);
  for (const studyId of pending) await cancelRequest(studyId, uid);

  await deleteDoc(doc(getFirebase().db, 'users', uid));
  await deleteProfilePhoto(uid);
  await deleteUser(user);
}

/** Confirm Google, delete hosted studies, leave every other study, then delete the account. */
export async function eraseOwnAccount(user: User): Promise<'redirect' | 'done'> {
  rememberAccountDeletion();
  try {
    const mode = await reauthenticateGoogleAccount(user);
    if (mode === 'redirect') return 'redirect';
  } catch (error) {
    sessionStorage.removeItem(DELETE_ACCOUNT_KEY);
    throw error;
  }
  sessionStorage.removeItem(DELETE_ACCOUNT_KEY);
  await wipeAccount(user);
  return 'done';
}

/** Finish a deletion that already confirmed Google on a full-page redirect. */
export async function finishAccountDeletion(user: User): Promise<void> {
  await wipeAccount(user);
}
