import { getApps, initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  connectAuthEmulator,
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
import { firebaseErrorCode } from '@/lib/errors';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { connectStorageEmulator, getStorage, type FirebaseStorage } from 'firebase/storage';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';

export interface FirebaseClient {
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
  functions: Functions;
}

function readConfig() {
  // Keep Firebase targets deployment-configurable; production settings are supplied by Vercel.
  const configuredDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '';
  const redirectDomain = process.env.NEXT_PUBLIC_FIREBASE_REDIRECT_DOMAIN || 'komunyon.vercel.app';
  const useSameOriginRedirect =
    typeof window !== 'undefined' && window.location.hostname === redirectDomain && prefersRedirectSignIn();
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
    // Use the site's proxied helper for browsers that block cross-site redirect state.
    authDomain: useSameOriginRedirect ? redirectDomain : configuredDomain,
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
  if (!resolver) return;
  void resolver._initialize(auth).catch(() => undefined);
}

let redirectResultRead = false;

export async function completeRedirectSignIn(auth: Auth): Promise<void> {
  if (redirectResultRead) return;
  redirectResultRead = true;
  const result = await getRedirectResult(auth);
  if (!result) return;
  await setPersistence(auth, browserLocalPersistence);
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
  await setPersistence(auth, browserSessionPersistence);
  await signInWithRedirect(auth, provider);
}

export async function signInWithGoogleAccount(auth: Auth): Promise<void> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  if (prefersRedirectSignIn()) {
    try {
      await redirectGoogleSignIn(auth, provider);
    } catch (error) {
      markGoogleSignInFailureStage(error, 'redirect');
      throw error;
    }
    return;
  }
  warmUpGoogleSignIn(auth);
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    if (firebaseErrorCode(error) !== 'auth/popup-blocked') {
      markGoogleSignInFailureStage(error, 'popup');
      throw error;
    }
    try {
      await redirectGoogleSignIn(auth, provider);
    } catch (redirectError) {
      markGoogleSignInFailureStage(redirectError, 'redirect fallback');
      throw redirectError;
    }
  }
}

const googleSignInFailureStages = new WeakMap<object, string>();

function markGoogleSignInFailureStage(error: unknown, stage: string): void {
  if (typeof error === 'object' && error !== null) googleSignInFailureStages.set(error, stage);
}

export function getGoogleSignInFailureStage(error: unknown): string {
  return typeof error === 'object' && error !== null
    ? googleSignInFailureStages.get(error) ?? 'provider flow'
    : 'provider flow';
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
    const useEmulators = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true';
    if (useEmulators && config.projectId !== 'demo-komunyon') {
      throw new Error('Firebase emulators may only be used with the demo-komunyon project.');
    }
    const app = getApps()[0] ?? initializeApp(config);
    const auth = getAuth(app);
    const db = getFirestore(app);
    const storage = getStorage(app);
    const functions = getFunctions(app, 'europe-west4');
    if (useEmulators) {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      connectFirestoreEmulator(db, '127.0.0.1', 8080);
      connectStorageEmulator(storage, '127.0.0.1', 9199);
      connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    }
    client = {
      auth,
      db,
      storage,
      functions,
    };
  }
  return client;
}
