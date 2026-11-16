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
import { firebaseErrorCode } from '@/lib/errors';
import { loginLog, markRedirectStarted, returnTripLines, takeRedirectMarker } from '@/lib/loginDebug';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

export interface FirebaseClient {
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
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
  if (!resolver) return;
  void resolver._initialize(auth).catch(() => undefined);
}

let redirectResultRead = false;

export function loginSignInMode(): 'redirect' | 'popup' {
  return prefersRedirectSignIn() ? 'redirect' : 'popup';
}

export function currentAuthDomain(): string {
  return readConfig().authDomain;
}

export async function completeRedirectSignIn(auth: Auth): Promise<void> {
  if (redirectResultRead) {
    loginLog('redirect result already read on this page load');
    return;
  }
  redirectResultRead = true;
  const cameBack = takeRedirectMarker();
  loginLog(cameBack ? 'same tab came back from Google' : 'no redirect marker on this page');
  for (const line of returnTripLines()) loginLog(line);
  loginLog(`reading redirect result, auth domain ${readConfig().authDomain}`);
  try {
    const result = await getRedirectResult(auth);
    if (!result) {
      loginLog(cameBack ? 'redirect result: none, so the dashboard was not opened' : 'redirect result: none');
      return;
    }
    loginLog(`redirect result: logged in, uid ${result.user.uid}`);
    await setPersistence(auth, browserLocalPersistence);
    loginLog('login saved on this phone');
  } catch (error) {
    loginLog(`redirect result failed: ${firebaseErrorCode(error) ?? 'unknown'}`);
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
  loginLog('sign-in method: redirect');
  await setPersistence(auth, browserSessionPersistence);
  loginLog(`persistence set to this tab, auth domain ${readConfig().authDomain}`);
  markRedirectStarted();
  await signInWithRedirect(auth, provider);
  loginLog('redirect started');
}

export async function signInWithGoogleAccount(auth: Auth): Promise<void> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  if (prefersRedirectSignIn()) {
    await redirectGoogleSignIn(auth, provider);
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
    };
  }
  return client;
}
