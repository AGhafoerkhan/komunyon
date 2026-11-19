'use client';

import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { usePathname } from 'next/navigation';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { actionError } from '@/lib/errors';
import {
  completeRedirectSignIn,
  getFirebase,
  getGoogleSignInFailureStage,
  isFirebaseConfigured,
  signInWithGoogleAccount,
  warmUpGoogleSignIn,
} from '@/lib/firebase';
import { uploadProfilePhoto } from '@/lib/photos';
import { loadOrCreateProfile, saveUserProfile } from '@/lib/users';
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
  const pathname = usePathname();

  useEffect(() => {
    if (!configured) return;
    if (pathname === '/logout') {
      setLoading(false);
      const { auth } = getFirebase();
      void signOut(auth).catch(() => undefined);
      return;
    }
    let requestId = 0;
    let unsubscribe = () => {};
    let cancelled = false;
    const { auth } = getFirebase();
    warmUpGoogleSignIn(auth);
    void (async () => {
      try {
        await completeRedirectSignIn(auth);
      } catch (redirectError: unknown) {
        if (!cancelled) setSignInError(actionError(redirectError, {
          action: 'finish Google sign-in redirect',
          operation: 'Firebase Auth getRedirectResult',
        }));
      }
      if (cancelled) return;
      unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
        const current = ++requestId;
        if (!firebaseUser) {
          setUser(null);
          setProfile(null);
          setError(null);
          setLoading(false);
          return;
        }
        setSignInError(null);
        void loadOrCreateProfile(firebaseUser)
          .then((nextProfile) => {
            if (current !== requestId || cancelled) return;
            setUser(firebaseUser);
            setProfile(nextProfile);
            setError(null);
            setLoading(false);
          })
          .catch((loadError: unknown) => {
            if (current !== requestId || cancelled) return;
            setUser(firebaseUser);
            setProfile(null);
            setError(actionError(loadError, {
              action: 'restore signed-in session',
              operation: 'load or migrate the current user profile',
              target: `users/${firebaseUser.uid} and private/contact`,
            }));
            setLoading(false);
          });
      });
    })();
    return () => {
      cancelled = true;
      requestId += 1;
      unsubscribe();
    };
  }, [configured, pathname]);

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
        try {
          await signInWithGoogleAccount(getFirebase().auth);
        } catch (signInFailure) {
          setSignInError(actionError(signInFailure, {
            action: 'sign in with Google',
            operation: `Firebase Auth Google sign-in: ${getGoogleSignInFailureStage(signInFailure)}`,
          }));
          throw signInFailure;
        }
      },
      async signOutUser() {
        const { auth } = getFirebase();
        await signOut(auth);
        setUser(null);
        setProfile(null);
      },
      async saveProfile(input, photo) {
        if (!user) throw new Error('You need to be signed in.');
        const photoURL = photo ? await uploadProfilePhoto(user.uid, photo) : profile?.photoURL || user.photoURL || '';
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
