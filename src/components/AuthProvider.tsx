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
import { photoFromFile } from '@/lib/avatar';
import { loadOrCreateProfile, saveUserProfile } from '@/lib/users';
import type { UserProfile } from '@/types';

interface ProfileInput {
  fullName: string;
  age: number;
  bio: string;
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
    let requestId = 0;
    const { auth } = getFirebase();
    warmUpGoogleSignIn(auth);
    void completeRedirectSignIn(auth).catch((redirectError: unknown) => {
      setSignInError(actionError(redirectError));
    });
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      const current = ++requestId;
      if (!firebaseUser) {
        setUser(null);
        setProfile(null);
        setError(null);
        setLoading(false);
        return;
      }
      void loadOrCreateProfile(firebaseUser)
        .then((nextProfile) => {
          if (current !== requestId) return;
          setUser(firebaseUser);
          setProfile(nextProfile);
          setError(null);
          setLoading(false);
        })
        .catch((loadError: unknown) => {
          if (current !== requestId) return;
          setUser(firebaseUser);
          setProfile(null);
          setError(actionError(loadError));
          setLoading(false);
        });
    });
    return () => {
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
        await signInWithGoogleAccount(getFirebase().auth);
      },
      async signOutUser() {
        const { auth } = getFirebase();
        await signOut(auth);
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
