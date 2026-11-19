import { deleteUser, type User } from 'firebase/auth';
import { collection, collectionGroup, deleteDoc, doc, getDocs, query, where } from 'firebase/firestore';
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

async function wipeAccount(user: User): Promise<void> {
  const uid = user.uid;
  const { db } = getFirebase();
  const hosted = await getDocs(query(collection(db, 'studies'), where('hostId', '==', uid)));
  for (const item of hosted.docs) await deleteStudy(item.id);

  const memberships = await getDocs(query(collectionGroup(db, 'members'), where('uid', '==', uid)));
  for (const item of memberships.docs) {
    const studyId = item.ref.parent.parent?.id;
    if (!studyId) continue;
    const status = item.data().status;
    if (status === 'approved') await leaveStudy(studyId, uid);
    else if (status === 'invited') await declineInvite(studyId, uid);
    else if (status === 'pending') await cancelRequest(studyId, uid);
  }

  await deleteDoc(doc(getFirebase().db, 'users', uid));
  await deleteDoc(doc(getFirebase().db, 'users', uid, 'private', 'contact')).catch(() => undefined);
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
