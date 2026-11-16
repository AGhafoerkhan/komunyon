import { deleteObject, getDownloadURL, listAll, ref, uploadBytes } from 'firebase/storage';
import { jpegBlob } from '@/lib/avatar';
import { firebaseErrorCode } from '@/lib/errors';
import { getFirebase } from '@/lib/firebase';

export type SessionPhoto = {
  path: string;
  url: string;
  ownerId: string;
};

function ownerFromName(name: string): string {
  const base = name.replace(/\.jpg$/, '');
  const split = base.lastIndexOf('-');
  return split > 0 ? base.slice(0, split) : '';
}

export async function uploadProfilePhoto(uid: string, file: File): Promise<string> {
  const blob = await jpegBlob(file, 512);
  const fileRef = ref(getFirebase().storage, `avatars/${uid}`);
  await uploadBytes(fileRef, blob, { contentType: 'image/jpeg' });
  return getDownloadURL(fileRef);
}

export async function deleteProfilePhoto(uid: string): Promise<void> {
  await deleteObject(ref(getFirebase().storage, `avatars/${uid}`)).catch(() => undefined);
}

export async function listSessionPhotos(studyId: string, date: string): Promise<SessionPhoto[]> {
  const folder = ref(getFirebase().storage, `sessions/${studyId}/${date}`);
  try {
    const listed = await listAll(folder);
    return Promise.all(
      listed.items.map(async (item) => ({
        path: item.fullPath,
        url: await getDownloadURL(item),
        ownerId: ownerFromName(item.name),
      })),
    );
  } catch (error) {
    if (firebaseErrorCode(error) === 'storage/object-not-found') return [];
    throw error;
  }
}

export async function uploadSessionPhoto(studyId: string, date: string, uid: string, file: File): Promise<void> {
  const blob = await jpegBlob(file, 1600);
  const fileRef = ref(getFirebase().storage, `sessions/${studyId}/${date}/${uid}-${Date.now()}.jpg`);
  await uploadBytes(fileRef, blob, { contentType: 'image/jpeg' });
}

export async function downloadSessionPhoto(photo: SessionPhoto, date: string): Promise<void> {
  const response = await fetch(photo.url);
  if (!response.ok) throw new Error('This photo could not be downloaded.');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `komunyon-${date}.jpg`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function deleteSessionPhoto(path: string): Promise<void> {
  await deleteObject(ref(getFirebase().storage, path));
}

/** Removes every session photo while the study document still exists, so the rules can see the host. */
export async function deleteStudyPhotos(studyId: string): Promise<void> {
  const root = ref(getFirebase().storage, `sessions/${studyId}`);
  const listed = await listAll(root).catch((error: unknown) => {
    if (firebaseErrorCode(error) === 'storage/object-not-found') return null;
    throw error;
  });
  if (!listed) return;
  const nested = await Promise.all(listed.prefixes.map((prefix) => listAll(prefix)));
  const files = [...listed.items, ...nested.flatMap((folder) => folder.items)];
  await Promise.all(files.map((item) => deleteObject(item).catch(() => undefined)));
}
