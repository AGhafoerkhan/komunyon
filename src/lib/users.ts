import { type User } from 'firebase/auth';
import { doc, getDoc, getDocs, query, setDoc, updateDoc, collection, where } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { getFirebase } from '@/lib/firebase';
import { LIMITS } from '@/lib/limits';
import { parseUserProfile } from '@/lib/parse';
import type { UserProfile } from '@/types';

function nowIso(): string {
  return new Date().toISOString();
}

export async function loadOrCreateProfile(user: User): Promise<UserProfile> {
  const { db } = getFirebase();
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const profile = parseUserProfile(snap.id, snap.data());
    if (!profile) throw new Error('Your profile could not be read.');
    return profile;
  }

  const now = nowIso();
  const stub: UserProfile = {
    uid: user.uid,
    email: user.email ?? '',
    fullName: '',
    age: 0,
    photoURL: '',
    bio: '',
    profileCompleted: false,
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(ref, stub);
  return stub;
}

export async function uploadAvatar(uid: string, file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
  if (file.size >= LIMITS.avatarBytes) throw new Error('Images need to be smaller than 5 MB.');
  const { storage } = getFirebase();
  const storageRef = ref(storage, `avatars/${uid}`);
  await uploadBytes(storageRef, file, { contentType: file.type });
  return getDownloadURL(storageRef);
}

async function syncHostedStudies(profile: UserProfile): Promise<void> {
  const { db } = getFirebase();
  const hosted = query(collection(db, 'studies'), where('hostId', '==', profile.uid));
  const snap = await getDocs(hosted);
  const updatedAt = nowIso();
  await Promise.all(
    snap.docs.map((study) =>
      updateDoc(study.ref, {
        hostName: profile.fullName,
        hostAge: profile.age,
        hostPhotoURL: profile.photoURL,
        updatedAt,
      }),
    ),
  );
}

export async function saveUserProfile(
  user: User,
  input: { fullName: string; age: number; bio: string; photoURL: string },
  existing: UserProfile | null,
): Promise<UserProfile> {
  const { db } = getFirebase();
  const now = nowIso();
  const profile: UserProfile = {
    uid: user.uid,
    email: user.email ?? '',
    fullName: input.fullName.trim(),
    age: input.age,
    photoURL: input.photoURL,
    bio: input.bio.trim(),
    profileCompleted: true,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  await setDoc(doc(db, 'users', user.uid), profile);
  try {
    await syncHostedStudies(profile);
  } catch {
    throw new Error('Your profile is saved, but hosted studies could not be updated. Save once more.');
  }
  return profile;
}
