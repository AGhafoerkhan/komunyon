import { type User } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, limit, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase';
import { isHagueArea } from '@/lib/hague';
import { parseUserProfile } from '@/lib/parse';
import { normalizePhone } from '@/lib/validate';
import { logAuthEvent, logAuthFailure } from '@/lib/errors';
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
  const projectId = db.app.options.projectId;
  const ref = doc(db, 'users', user.uid);
  logAuthEvent('profile-document-read-started', { projectId, uid: user.uid, path: `users/${user.uid}` });
  let snap;
  try {
    snap = await getDoc(ref);
  } catch (error) {
    logAuthFailure('profile-document-read-failed', error, { projectId, uid: user.uid, path: `users/${user.uid}` });
    throw error;
  }
  logAuthEvent('profile-document-read-completed', { projectId, uid: user.uid, exists: snap.exists() });
  if (snap.exists()) {
    const rawProfile = snap.data();
    logAuthEvent('profile-schema-compat-check', {
      projectId,
      uid: user.uid,
      storedEmailType: rawProfile.email === null ? 'null' : typeof rawProfile.email,
      authEmailAvailable: Boolean(user.email),
    });
    const profile = parseUserProfile(snap.id, rawProfile, user.email ?? '');
    if (!profile) {
      const requiredFields = ['email', 'fullName', 'age', 'photoURL', 'bio', 'profileCompleted', 'createdAt', 'updatedAt'] as const;
      const actualTypes = Object.fromEntries(requiredFields.map((field) => [
        field,
        rawProfile[field] === null ? 'null' : Array.isArray(rawProfile[field]) ? 'array' : typeof rawProfile[field],
      ]));
      const expectedTypes: Record<(typeof requiredFields)[number], string> = {
        email: 'string', fullName: 'string', age: 'integer', photoURL: 'string', bio: 'string',
        profileCompleted: 'boolean', createdAt: 'string', updatedAt: 'string',
      };
      const invalidFields = requiredFields.filter((field) => {
        if (field === 'email' && rawProfile.email === undefined) return false;
        return field === 'age'
          ? typeof rawProfile[field] !== 'number' || !Number.isInteger(rawProfile[field])
          : typeof rawProfile[field] !== expectedTypes[field];
      });
      logAuthEvent('profile-schema-invalid', {
        projectId,
        uid: user.uid,
        path: `users/${user.uid}`,
        invalidFields,
        expectedTypes: Object.fromEntries(invalidFields.map((field) => [field, expectedTypes[field]])),
        actualTypes: Object.fromEntries(invalidFields.map((field) => [field, actualTypes[field]])),
        fieldNames: Object.keys(rawProfile),
      });
      throw new Error('Your profile could not be read.');
    }
    if (typeof rawProfile.email !== 'string') {
      logAuthEvent('profile-email-fallback-used', {
        projectId,
        uid: user.uid,
        source: user.email ? 'firebase-auth' : 'empty-fallback',
      });
    }
    const tokens = nameTokens(profile.fullName);
    if (profile.profileCompleted && !sameTokens(snap.data().nameTokens, tokens)) {
      logAuthEvent('profile-name-token-sync-started', { projectId, uid: user.uid });
      await updateDoc(ref, { nameTokens: tokens, updatedAt: nowIso() }).then(
        () => logAuthEvent('profile-name-token-sync-succeeded', { projectId, uid: user.uid }),
        (error: unknown) => logAuthFailure('profile-name-token-sync-failed', error, { projectId, uid: user.uid }),
      );
    }
    return profile;
  }

  logAuthEvent('profile-stub-creation-started', { projectId, uid: user.uid, path: `users/${user.uid}` });
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
  try {
    await setDoc(ref, { ...stub, nameTokens: [] });
    logAuthEvent('profile-stub-creation-succeeded', { projectId, uid: user.uid });
  } catch (error) {
    logAuthFailure('profile-stub-creation-failed', error, { projectId, uid: user.uid });
    throw error;
  }
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
  const tokens = nameTokens(profile.fullName);
  const ruleChecks = {
    uidMatchesPath: profile.uid === user.uid,
    emailAvailable: Boolean(profile.email),
    fullNameLengthValid: profile.fullName.length >= 2 && profile.fullName.length <= 80,
    ageValid: Number.isInteger(profile.age) && profile.age >= 1 && profile.age <= 120,
    photoFormatValid: profile.photoURL.length > 0 && (
      (profile.photoURL.length <= 2000 && profile.photoURL.startsWith('https://'))
      || (profile.photoURL.length <= 24000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(profile.photoURL))
    ),
    bioLengthValid: profile.bio.length <= 800,
    countryValid: profile.country.length >= 2 && profile.country.length <= 60,
    cityValid: profile.city.length >= 2 && profile.city.length <= 80,
    neighbourhoodValid: profile.neighbourhood.length <= 80
      && (profile.city !== 'The Hague' || isHagueArea(profile.neighbourhood)),
    phoneFormatValid: /^\+?[0-9]{8,15}$/.test(profile.phone),
    timestampsValid: typeof profile.createdAt === 'string' && typeof profile.updatedAt === 'string',
    nameTokenCountValid: tokens.length <= 120,
  };
  logAuthEvent('profile-save-write-started', {
    projectId: db.app.options.projectId,
    uid: user.uid,
    operation: existing ? 'update' : 'create',
    ruleChecks,
  });
  try {
    await setDoc(doc(db, 'users', user.uid), { ...profile, nameTokens: tokens });
    logAuthEvent('profile-save-write-succeeded', { projectId: db.app.options.projectId, uid: user.uid });
  } catch (error) {
    logAuthFailure('profile-save-write-failed', error, {
      projectId: db.app.options.projectId,
      uid: user.uid,
      operation: existing ? 'update' : 'create',
      ruleChecks,
    });
    throw error;
  }
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
    query(collection(db, 'users'), where('nameTokens', 'array-contains', token), limit(8)),
  );
  const people: UserProfile[] = [];
  snap.docs.forEach((item) => {
    const profile = parseUserProfile(item.id, item.data());
    if (profile?.profileCompleted) people.push(profile);
  });
  return people;
}
