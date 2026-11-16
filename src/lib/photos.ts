import { deleteObject, getDownloadURL, listAll, ref, uploadBytes } from 'firebase/storage';
import { jpegBlob } from '@/lib/avatar';
import { firebaseErrorCode } from '@/lib/errors';
import { getFirebase } from '@/lib/firebase';
import { LIMITS } from '@/lib/limits';

export type SessionFileKind = 'image' | 'audio' | 'text';

export type SessionFile = {
  path: string;
  url: string;
  name: string;
  kind: SessionFileKind;
};

const AUDIO_TYPES: Record<string, string> = {
  webm: 'audio/webm',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
};

function extension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

function kindFromName(name: string): SessionFileKind | null {
  const ext = extension(name);
  if (ext === 'jpg') return 'image';
  if (ext === 'txt') return 'text';
  if (ext in AUDIO_TYPES) return 'audio';
  return null;
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

export async function listSessionFiles(studyId: string, date: string): Promise<SessionFile[]> {
  const folder = ref(getFirebase().storage, `sessions/${studyId}/${date}`);
  try {
    const listed = await listAll(folder);
    const files = await Promise.all(
      listed.items.map(async (item) => {
        const kind = kindFromName(item.name);
        if (!kind) return null;
        return {
          path: item.fullPath,
          url: await getDownloadURL(item),
          name: item.name,
          kind,
        };
      }),
    );
    return files.filter((file): file is SessionFile => file !== null);
  } catch (error) {
    if (firebaseErrorCode(error) === 'storage/object-not-found') return [];
    throw error;
  }
}

export async function uploadSessionFile(studyId: string, date: string, uid: string, file: File): Promise<void> {
  const stamp = `${uid}-${Date.now()}`;
  if (file.type.startsWith('image/')) {
    const blob = await jpegBlob(file, 1600);
    const fileRef = ref(getFirebase().storage, `sessions/${studyId}/${date}/${stamp}.jpg`);
    await uploadBytes(fileRef, blob, { contentType: 'image/jpeg' });
    return;
  }
  const ext = extension(file.name);
  if (ext === 'txt' || file.type === 'text/plain') {
    if (file.size >= LIMITS.sessionTextBytes) throw new Error('Text files need to be smaller than 1 MB.');
    const fileRef = ref(getFirebase().storage, `sessions/${studyId}/${date}/${stamp}.txt`);
    await uploadBytes(fileRef, file, { contentType: 'text/plain' });
    return;
  }
  const audioType = AUDIO_TYPES[ext];
  if (file.type.startsWith('audio/') && audioType) {
    if (file.size >= LIMITS.sessionAudioBytes) throw new Error('Recordings need to be smaller than 32 MB.');
    const fileRef = ref(getFirebase().storage, `sessions/${studyId}/${date}/${stamp}.${ext}`);
    await uploadBytes(fileRef, file, { contentType: audioType });
    return;
  }
  throw new Error('Add a photo, a text file, or a WEBM, M4A, MP3, OGG, or WAV recording.');
}

export async function downloadSessionFile(file: SessionFile, date: string): Promise<void> {
  const response = await fetch(file.url);
  if (!response.ok) throw new Error('This file could not be downloaded.');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `komunyon-${date}.${extension(file.name) || 'bin'}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function deleteSessionFile(path: string): Promise<void> {
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
