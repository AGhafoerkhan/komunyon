import { type User } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, limit, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase';
import { parseUserProfile } from '@/lib/parse';
import { normalizePhone } from '@/lib/validate';
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
  const contactRef = doc(db, 'users', user.uid, 'private', 'contact');
  const [snap, contactSnap] = await Promise.all([getDoc(ref), getDoc(contactRef)]);
  if (snap.exists()) {
    const profile = parseUserProfile(snap.id, snap.data());
    if (!profile) throw new Error('Your profile could not be read.');
    const stored = snap.data();
    const privateContact = contactSnap.exists() ? contactSnap.data() : {};
    const contact = {
      email: user.email ?? (typeof privateContact.email === 'string' ? privateContact.email : ''),
      phone: (typeof privateContact.phone === 'string' && privateContact.phone) || (typeof stored.phone === 'string' ? stored.phone : ''),
      country: (typeof privateContact.country === 'string' && privateContact.country) || (typeof stored.country === 'string' ? stored.country : ''),
      city: (typeof privateContact.city === 'string' && privateContact.city) || (typeof stored.city === 'string' ? stored.city : ''),
      neighbourhood: (typeof privateContact.neighbourhood === 'string' && privateContact.neighbourhood) || (typeof stored.neighbourhood === 'string' ? stored.neighbourhood : ''),
      updatedAt: nowIso(),
    };
    const hasLegacyPrivateFields = ['email', 'phone', 'country', 'city', 'neighbourhood']
      .some((key) => Object.prototype.hasOwnProperty.call(stored, key));
    const tokens = nameTokens(profile.fullName);
    const tokensNeedUpdate = !sameTokens(stored.nameTokens, tokens);
    if (!contactSnap.exists() || hasLegacyPrivateFields) await setDoc(contactRef, contact);
    if (hasLegacyPrivateFields || stored.publicProfile !== profile.profileCompleted) {
      await setDoc(ref, {
        uid: profile.uid,
        fullName: profile.fullName,
        age: profile.age,
        photoURL: profile.photoURL,
        bio: profile.bio,
        profileCompleted: profile.profileCompleted,
        publicProfile: profile.profileCompleted,
        nameTokens: tokens,
        createdAt: profile.createdAt,
        updatedAt: nowIso(),
      });
    } else if (tokensNeedUpdate) {
      await updateDoc(ref, { nameTokens: tokens, updatedAt: nowIso() });
    }
    return { ...profile, ...contact, email: user.email ?? contact.email };
  }

  const now = nowIso();
  const stub: UserProfile = {
    uid: user.uid,
    email: user.email ?? '',
    fullName: '',
    age: 0,
    photoURL: '',
    bio: '',
    country: '',
    city: '',
    neighbourhood: '',
    phone: '',
    profileCompleted: false,
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(ref, {
    uid: stub.uid,
    fullName: stub.fullName,
    age: stub.age,
    photoURL: stub.photoURL,
    bio: stub.bio,
    profileCompleted: false,
    publicProfile: false,
    nameTokens: [],
    createdAt: now,
    updatedAt: now,
  });
  await setDoc(contactRef, {
    email: user.email ?? '',
    phone: '',
    country: '',
    city: '',
    neighbourhood: '',
    updatedAt: now,
  });
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
  input: {
    fullName: string;
    age: number;
    bio: string;
    photoURL: string;
    country: string;
    city: string;
    neighbourhood: string;
    phone: string;
  },
  existing: UserProfile | null,
): Promise<UserProfile> {
  const { db } = getFirebase();
  const now = nowIso();
  const phone = normalizePhone(input.phone);
  if (!phone) throw new Error('Enter a phone number, including the country code.');
  const profile: UserProfile = {
    uid: user.uid,
    email: user.email ?? '',
    fullName: input.fullName.trim(),
    age: input.age,
    photoURL: input.photoURL,
    bio: input.bio.trim(),
    country: input.country.trim(),
    city: input.city.trim(),
    neighbourhood: input.neighbourhood.trim(),
    phone,
    profileCompleted: true,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  await setDoc(doc(db, 'users', user.uid, 'private', 'contact'), {
    email: profile.email,
    phone: profile.phone,
    country: profile.country,
    city: profile.city,
    neighbourhood: profile.neighbourhood,
    updatedAt: profile.updatedAt,
  });
  await setDoc(doc(db, 'users', user.uid), {
    uid: profile.uid,
    fullName: profile.fullName,
    age: profile.age,
    photoURL: profile.photoURL,
    bio: profile.bio,
    profileCompleted: true,
    publicProfile: true,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    nameTokens: nameTokens(profile.fullName),
  });
  try {
    await syncHostedStudies(profile);
  } catch {
    throw new Error('Your profile is saved, but hosted studies could not be updated. Save once more.');
  }
  return profile;
}

export async function loadProfile(uid: string): Promise<UserProfile | null> {
  const { db } = getFirebase();
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  return parseUserProfile(snap.id, snap.data());
}

export async function searchProfiles(term: string): Promise<UserProfile[]> {
  const token = term.trim().toLowerCase().replace(/\s+/g, ' ');
  if (token.length < 2 || token.length > 24) return [];
  const { db } = getFirebase();
  const snap = await getDocs(
    query(collection(db, 'users'), where('publicProfile', '==', true), where('nameTokens', 'array-contains', token), limit(8)),
  );
  const people: UserProfile[] = [];
  snap.docs.forEach((item) => {
    const profile = parseUserProfile(item.id, item.data());
    if (profile?.profileCompleted) people.push(profile);
  });
  return people;
}
