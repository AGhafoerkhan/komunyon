import { getApps, initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  reauthenticateWithPopup,
  reauthenticateWithRedirect,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  type Auth,
  type User,
} from 'firebase/auth';
import { firebaseErrorCode, logAuthEvent, logAuthFailure } from '@/lib/errors';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { getFunctions, type Functions } from 'firebase/functions';

export interface FirebaseClient {
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
  functions: Functions;
}

function readConfig() {
  const configuredDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '';
  const onProductionSite =
    typeof window !== 'undefined' && window.location.hostname === 'komunyon.vercel.app';
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
    // Firefox blocks a login that returns from firebaseapp.com. On that browser the
    // helper has to live on komunyon.vercel.app, which is proxied to Firebase.
    authDomain: onProductionSite && prefersRedirectSignIn() ? 'komunyon.vercel.app' : configuredDomain,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '',
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '',
  };
}

export function missingFirebaseEnv(): string[] {
  const config = readConfig();
  const entries: Array<[string, string]> = [
    ['NEXT_PUBLIC_FIREBASE_API_KEY', config.apiKey],
    ['NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', config.authDomain],
    ['NEXT_PUBLIC_FIREBASE_PROJECT_ID', config.projectId],
    ['NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET', config.storageBucket],
    ['NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID', config.messagingSenderId],
    ['NEXT_PUBLIC_FIREBASE_APP_ID', config.appId],
  ];
  return entries.filter(([, value]) => value.trim().length === 0).map(([key]) => key);
}

export function isFirebaseConfigured(): boolean {
  return missingFirebaseEnv().length === 0;
}

interface PopupResolver {
  _initialize: (auth: Auth) => Promise<unknown>;
}

/**
 * Firebase opens the Google window only after its helper frame has loaded.
 * Chrome drops the click by then and blocks the window. Start that load as soon
 * as the page is open so the click can still open it.
 */
export function warmUpGoogleSignIn(auth: Auth): void {
  const resolver = (auth as Auth & { _popupRedirectResolver?: PopupResolver })._popupRedirectResolver;
  if (!resolver) {
    logAuthEvent('popup-warmup-unavailable', { projectId: auth.app.options.projectId });
    return;
  }
  logAuthEvent('popup-warmup-started', { projectId: auth.app.options.projectId });
  void resolver._initialize(auth)
    .then(() => logAuthEvent('popup-warmup-completed', { projectId: auth.app.options.projectId }))
    .catch((error: unknown) => logAuthFailure('popup-warmup-failed', error, { projectId: auth.app.options.projectId }));
}

let redirectResultRead = false;

export async function completeRedirectSignIn(auth: Auth): Promise<void> {
  if (redirectResultRead) return;
  redirectResultRead = true;
  logAuthEvent('redirect-result-check-started', { projectId: auth.app.options.projectId });
  try {
    const result = await getRedirectResult(auth);
    if (!result) {
      logAuthEvent('redirect-result-empty', { projectId: auth.app.options.projectId });
      return;
    }
    logAuthEvent('redirect-result-received', {
      projectId: auth.app.options.projectId,
      uid: result.user.uid,
      providerIds: result.user.providerData.map((provider) => provider.providerId),
    });
    await setPersistence(auth, browserLocalPersistence);
    logAuthEvent('redirect-persistence-set', { projectId: auth.app.options.projectId, uid: result.user.uid });
  } catch (error) {
    logAuthFailure('redirect-result-failed', error, { projectId: auth.app.options.projectId });
    throw error;
  }
}

/** Firefox and iPhone never finish a Google popup. Chrome, including Chrome on a phone, does. */
function prefersRedirectSignIn(): boolean {
  const ua = navigator.userAgent;
  if (/Firefox\//.test(ua)) return true;
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true;
  return false;
}

async function redirectGoogleSignIn(auth: Auth, provider: GoogleAuthProvider): Promise<void> {
  logAuthEvent('redirect-sign-in-started', { projectId: auth.app.options.projectId });
  await setPersistence(auth, browserSessionPersistence);
  logAuthEvent('redirect-persistence-set', { projectId: auth.app.options.projectId });
  await signInWithRedirect(auth, provider);
  logAuthEvent('redirect-navigation-requested', { projectId: auth.app.options.projectId });
}

export async function signInWithGoogleAccount(auth: Auth): Promise<void> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  logAuthEvent('google-sign-in-started', {
    projectId: auth.app.options.projectId,
    authDomain: auth.app.options.authDomain,
    method: prefersRedirectSignIn() ? 'redirect' : 'popup',
  });
  if (prefersRedirectSignIn()) {
    await redirectGoogleSignIn(auth, provider);
    return;
  }
  warmUpGoogleSignIn(auth);
  try {
    const result = await signInWithPopup(auth, provider);
    logAuthEvent('google-popup-sign-in-succeeded', {
      projectId: auth.app.options.projectId,
      uid: result.user.uid,
      providerIds: result.user.providerData.map((item) => item.providerId),
    });
  } catch (error) {
    if (firebaseErrorCode(error) !== 'auth/popup-blocked') {
      logAuthFailure('google-popup-sign-in-failed', error, { projectId: auth.app.options.projectId });
      throw error;
    }
    logAuthEvent('google-popup-blocked-falling-back-to-redirect', { projectId: auth.app.options.projectId });
    await redirectGoogleSignIn(auth, provider);
  }
}

/** Google must be confirmed again before Firebase will delete the account. */
export async function reauthenticateGoogleAccount(user: User): Promise<'redirect' | 'popup'> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  if (prefersRedirectSignIn()) {
    await reauthenticateWithRedirect(user, provider);
    return 'redirect';
  }
  warmUpGoogleSignIn(getFirebase().auth);
  try {
    await reauthenticateWithPopup(user, provider);
    return 'popup';
  } catch (error) {
    if (firebaseErrorCode(error) !== 'auth/popup-blocked') throw error;
    await reauthenticateWithRedirect(user, provider);
    return 'redirect';
  }
}

let client: FirebaseClient | null = null;

export function getFirebase(): FirebaseClient {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase environment variables are missing.');
  }
  if (typeof window === 'undefined') {
    throw new Error('Firebase is initialized in the browser only.');
  }
  if (!client) {
    const config = readConfig();
    const app = getApps()[0] ?? initializeApp(config);
    client = {
      auth: getAuth(app),
      db: getFirestore(app),
      storage: getStorage(app),
      functions: getFunctions(app, 'europe-west4'),
    };
  }
  return client;
}
