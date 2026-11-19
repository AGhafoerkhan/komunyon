import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  doc,
  getDoc,
  getFirestore,
  setDoc,
  updateDoc,
  type Firestore,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const projectId = 'demo-komunyon';
let app: FirebaseApp;
let auth: Auth;
let firestore: Firestore;

beforeAll(() => {
  app = initializeApp({ apiKey: 'fake-api-key', projectId, appId: '1:123:web:test' }, `auth-tests-${Date.now()}`);
  auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
});

beforeEach(async () => {
  if (auth.currentUser) await signOut(auth);
});

afterAll(async () => {
  if (auth.currentUser) await signOut(auth);
  await deleteApp(app);
});

describe('Firebase authentication', () => {
  it('completes signup, profile creation and edit, logout, and a returning sign-in', async () => {
    const email = `account-lifecycle-${crypto.randomUUID()}@example.test`;
    const password = 'correct-password-123';
    const created = await createUserWithEmailAndPassword(auth, email, password);
    const uid = created.user.uid;
    const now = new Date().toISOString();
    const profileRef = doc(firestore, 'users', uid);
    const contactRef = doc(firestore, 'users', uid, 'private', 'contact');

    await setDoc(profileRef, {
      uid,
      fullName: '',
      age: 0,
      photoURL: '',
      bio: '',
      profileCompleted: false,
      publicProfile: false,
      nameTokens: [],
      createdAt: now,
      updatedAt: now,
    });
    await setDoc(contactRef, {
      email,
      phone: '',
      country: '',
      city: '',
      neighbourhood: '',
      updatedAt: now,
    });

    await setDoc(contactRef, {
      email,
      phone: '+31612345678',
      country: 'Netherlands',
      city: 'The Hague',
      neighbourhood: 'Centrum',
      updatedAt: now,
    });
    await updateDoc(profileRef, {
      fullName: 'Lifecycle Test User',
      age: 30,
      photoURL: '',
      bio: 'I speak Dutch and English.',
      profileCompleted: true,
      publicProfile: true,
      nameTokens: ['lifecycle', 'test', 'user'],
      updatedAt: now,
    });
    await updateDoc(profileRef, {
      fullName: 'Updated Lifecycle User',
      updatedAt: new Date().toISOString(),
    });

    expect((await getDoc(profileRef)).data()?.fullName).toBe('Updated Lifecycle User');
    await signOut(auth);
    expect(auth.currentUser).toBeNull();
    await expect(getDoc(profileRef)).rejects.toMatchObject({ code: 'permission-denied' });

    const returningUser = await signInWithEmailAndPassword(auth, email, password);
    expect(returningUser.user.uid).toBe(uid);
    expect((await getDoc(profileRef)).data()?.profileCompleted).toBe(true);
    await signOut(auth);
    expect(auth.currentUser).toBeNull();
  });

  it('signs in an existing account and signs out cleanly', async () => {
    const email = `auth-flow-${crypto.randomUUID()}@example.test`;
    const password = 'correct-password-123';
    const created = await createUserWithEmailAndPassword(auth, email, password);
    const uid = created.user.uid;
    await signOut(auth);
    expect(auth.currentUser).toBeNull();

    const signedIn = await signInWithEmailAndPassword(auth, email, password);
    expect(signedIn.user.uid).toBe(uid);
    expect(auth.currentUser?.uid).toBe(uid);

    await signOut(auth);
    expect(auth.currentUser).toBeNull();
  });

  it('rejects incorrect credentials without creating an authenticated session', async () => {
    const email = `auth-invalid-${crypto.randomUUID()}@example.test`;
    await createUserWithEmailAndPassword(auth, email, 'correct-password-123');
    await signOut(auth);

    await expect(signInWithEmailAndPassword(auth, email, 'wrong-password-123')).rejects.toMatchObject({
      code: expect.stringMatching(/^auth\/(wrong-password|invalid-credential)$/),
    });
    expect(auth.currentUser).toBeNull();
  });

  it('rejects an unknown account without creating an authenticated session', async () => {
    await expect(signInWithEmailAndPassword(auth, `missing-${crypto.randomUUID()}@example.test`, 'any-password-123'))
      .rejects.toMatchObject({ code: expect.stringMatching(/^auth\/(user-not-found|invalid-credential)$/) });
    expect(auth.currentUser).toBeNull();
  });
});
