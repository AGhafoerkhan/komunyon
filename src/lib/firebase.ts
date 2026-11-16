import { getApps, initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
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
import { loginLog } from '@/lib/loginDebug';
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

export function loginSignInMode(): 'redirect' | 'popup' {
  return prefersRedirectSignIn() ? 'redirect' : 'popup';
}

export async function completeRedirectSignIn(auth: Auth): Promise<void> {
  if (redirectResultRead) {
    loginLog('redirect result already read on this page load');
    return;
  }
  redirectResultRead = true;
  loginLog('reading redirect result');
  try {
    const result = await getRedirectResult(auth);
    if (!result) loginLog('redirect result: none');
    else loginLog(`redirect result: logged in, uid ${result.user.uid}`);
  } catch (error) {
    loginLog(`redirect result failed: ${firebaseErrorCode(error) ?? 'unknown'}`);
    throw error;
  }
}

/** Popup sign-in never finishes in Firefox, or on a phone, so those use a full-page redirect. */
function prefersRedirectSignIn(): boolean {
  const ua = navigator.userAgent;
  if (/Firefox\//.test(ua)) return true;
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true;
  return /Android/i.test(ua);
}

export async function signInWithGoogleAccount(auth: Auth): Promise<void> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  if (prefersRedirectSignIn()) {
    loginLog('sign-in method: redirect');
    await setPersistence(auth, browserLocalPersistence);
    loginLog('persistence set to this browser');
    await signInWithRedirect(auth, provider);
    loginLog('redirect started');
    return;
  }
  warmUpGoogleSignIn(auth);
  loginLog('sign-in method: popup');
  try {
    await signInWithPopup(auth, provider);
    loginLog('popup finished');
  } catch (error) {
    const code = firebaseErrorCode(error) ?? 'unknown';
    loginLog(`popup failed: ${code}`);
    if (code !== 'auth/popup-blocked') throw error;
    loginLog('popup was blocked, switching to redirect');
    await setPersistence(auth, browserLocalPersistence);
    await signInWithRedirect(auth, provider);
    loginLog('redirect started');
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
    };
  }
  return client;
}
