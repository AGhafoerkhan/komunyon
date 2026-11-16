'use client';

import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { actionError } from '@/lib/errors';
import {
  completeRedirectSignIn,
  getFirebase,
  isFirebaseConfigured,
  signInWithGoogleAccount,
  warmUpGoogleSignIn,
} from '@/lib/firebase';
import { loginLog, captureLoginDebugRequest } from '@/lib/loginDebug';
import { photoFromFile } from '@/lib/avatar';
import { loadOrCreateProfile, saveUserProfile } from '@/lib/users';
import { isProfileReady } from '@/lib/validate';
import type { UserProfile } from '@/types';

interface ProfileInput {
  fullName: string;
  age: number;
  bio: string;
  country: string;
  city: string;
  neighbourhood: string;
  phone: string;
}

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  signInError: string | null;
  configured: boolean;
  prepareGoogleSignIn: () => void;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  saveProfile: (input: ProfileInput, photo: File | null) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(isFirebaseConfigured());
  const [error, setError] = useState<string | null>(null);
  const [signInError, setSignInError] = useState<string | null>(null);
  const configured = isFirebaseConfigured();

  useEffect(() => {
    if (!configured) return;
    captureLoginDebugRequest();
    let requestId = 0;
    let unsubscribe = () => {};
    let cancelled = false;
    const { auth } = getFirebase();
    loginLog(`auth starting, current user ${auth.currentUser ? 'present' : 'none'}`);
    warmUpGoogleSignIn(auth);
    void (async () => {
      try {
        await completeRedirectSignIn(auth);
      } catch (redirectError: unknown) {
        loginLog(`redirect sign-in error: ${actionError(redirectError)}`);
        if (!cancelled) setSignInError(actionError(redirectError));
      }
      if (cancelled) return;
      unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
        const current = ++requestId;
        if (!firebaseUser) {
          loginLog('auth state: logged out');
          setUser(null);
          setProfile(null);
          setError(null);
          setLoading(false);
          return;
        }
        loginLog(`auth state: logged in, uid ${firebaseUser.uid}`);
        void loadOrCreateProfile(firebaseUser)
          .then((nextProfile) => {
            if (current !== requestId || cancelled) return;
            loginLog(`profile ${isProfileReady(nextProfile) ? 'ready' : 'incomplete'}`);
            setUser(firebaseUser);
            setProfile(nextProfile);
            setError(null);
            setLoading(false);
          })
          .catch((loadError: unknown) => {
            if (current !== requestId || cancelled) return;
            loginLog(`profile failed: ${actionError(loadError)}`);
            setUser(firebaseUser);
            setProfile(null);
            setError(actionError(loadError));
            setLoading(false);
          });
      });
    })();
    return () => {
      cancelled = true;
      requestId += 1;
      unsubscribe();
    };
  }, [configured]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      loading,
      error,
      signInError,
      configured,
      prepareGoogleSignIn() {
        if (!configured) return;
        warmUpGoogleSignIn(getFirebase().auth);
      },
      async signInWithGoogle() {
        setSignInError(null);
        loginLog('sign-in clicked');
        try {
          await signInWithGoogleAccount(getFirebase().auth);
        } catch (error) {
        loginLog(`sign-in stopped: ${actionError(error)}`);
        setSignInError(actionError(error));
        throw error;
        }
      },
      async signOutUser() {
        const { auth } = getFirebase();
        loginLog('sign out clicked');
        await signOut(auth);
        loginLog('signed out');
        setUser(null);
        setProfile(null);
      },
      async saveProfile(input, photo) {
        if (!user) throw new Error('You need to be signed in.');
        const photoURL = photo ? await photoFromFile(photo) : profile?.photoURL || user.photoURL || '';
        const next = await saveUserProfile(user, { ...input, photoURL }, profile);
        setProfile(next);
      },
    }),
    [configured, error, loading, profile, signInError, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider.');
  return value;
}
