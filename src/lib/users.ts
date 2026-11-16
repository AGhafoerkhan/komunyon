import { type User } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, limit, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase';
import { parseUserProfile } from '@/lib/parse';
import type { UserProfile } from '@/types';

function nowIso(): string {
  return new Date().toISOString();
}

/** Prefixes of the full name and of each word, so a host can search by first or last name. */
export function nameTokens(fullName: string): string[] {
  const name = fullName.trim().toLowerCase().replace(/\s+/g, ' ');
  if (name.length < 2) return [];
  const tokens = new Set<string>();
  const add = (word: string) => {
    const capped = word.slice(0, 24);
    for (let length = 2; length <= capped.length; length += 1) tokens.add(capped.slice(0, length));
  };
  add(name);
  for (const word of name.split(' ')) add(word);
  return [...tokens].slice(0, 120);
}

function sameTokens(current: unknown, next: string[]): boolean {
  if (!Array.isArray(current) || current.length !== next.length) return false;
  const have = new Set(current);
  return next.every((token) => have.has(token));
}

export async function loadOrCreateProfile(user: User): Promise<UserProfile> {
  const { db } = getFirebase();
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const profile = parseUserProfile(snap.id, snap.data());
    if (!profile) throw new Error('Your profile could not be read.');
    const tokens = nameTokens(profile.fullName);
    if (profile.profileCompleted && !sameTokens(snap.data().nameTokens, tokens)) {
      await updateDoc(ref, { nameTokens: tokens, updatedAt: nowIso() }).catch(() => undefined);
    }
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
  await setDoc(ref, { ...stub, nameTokens: [] });
  return stub;
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
  await setDoc(doc(db, 'users', user.uid), { ...profile, nameTokens: nameTokens(profile.fullName) });
  try {
    await syncHostedStudies(profile);
  } catch {
    throw new Error('Your profile is saved, but hosted studies could not be updated. Save once more.');
  }
  return profile;
}

export async function searchProfiles(term: string): Promise<UserProfile[]> {
  const token = term.trim().toLowerCase().replace(/\s+/g, ' ');
  if (token.length < 2 || token.length > 24) return [];
  const { db } = getFirebase();
  const snap = await getDocs(
    query(collection(db, 'users'), where('nameTokens', 'array-contains', token), limit(8)),
  );
  const people: UserProfile[] = [];
  snap.docs.forEach((item) => {
    const profile = parseUserProfile(item.id, item.data());
    if (profile?.profileCompleted) people.push(profile);
  });
  return people;
}
