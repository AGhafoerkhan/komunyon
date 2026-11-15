import { getApps, initializeApp } from 'firebase/app';
import {
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  type Auth,
} from 'firebase/auth';
import { firebaseErrorCode } from '@/lib/errors';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

export interface FirebaseClient {
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
}

function readConfig() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
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
  await getRedirectResult(auth);
}

export async function signInWithGoogleAccount(auth: Auth): Promise<void> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  warmUpGoogleSignIn(auth);
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    if (firebaseErrorCode(error) !== 'auth/popup-blocked') throw error;
    await signInWithRedirect(auth, provider);
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
    };
  }
  return client;
}
