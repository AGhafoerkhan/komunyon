import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
} from 'firebase/auth';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const projectId = 'demo-komunyon';
let app: FirebaseApp;
let auth: Auth;

beforeAll(() => {
  app = initializeApp({ apiKey: 'fake-api-key', projectId, appId: '1:123:web:test' }, `auth-tests-${Date.now()}`);
  auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
});

beforeEach(async () => {
  if (auth.currentUser) await signOut(auth);
});

afterAll(async () => {
  if (auth.currentUser) await signOut(auth);
  await deleteApp(app);
});

describe('Firebase authentication', () => {
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
