'use client';

import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { usePathname } from 'next/navigation';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { actionError, logAuthEvent, logAuthFailure } from '@/lib/errors';
import {
  completeRedirectSignIn,
  getFirebase,
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
      logAuthEvent('logout-route-sign-out-started');
      setLoading(false);
      const { auth } = getFirebase();
      void signOut(auth)
        .then(() => logAuthEvent('logout-route-sign-out-succeeded', { projectId: auth.app.options.projectId }))
        .catch((failure: unknown) => logAuthFailure('logout-route-sign-out-failed', failure, { projectId: auth.app.options.projectId }));
      return;
    }
    let requestId = 0;
    let unsubscribe = () => {};
    let cancelled = false;
    const { auth } = getFirebase();
    logAuthEvent('auth-provider-started', { projectId: auth.app.options.projectId, pathname });
    warmUpGoogleSignIn(auth);
    void (async () => {
      try {
        await completeRedirectSignIn(auth);
      } catch (redirectError: unknown) {
        if (!cancelled) {
          logAuthFailure('redirect-completion-failed', redirectError, { projectId: auth.app.options.projectId, pathname });
          setSignInError(actionError(redirectError));
        }
      }
      if (cancelled) return;
      logAuthEvent('auth-state-listener-subscribing', { projectId: auth.app.options.projectId, pathname });
      unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
        const current = ++requestId;
        if (!firebaseUser) {
          logAuthEvent('auth-state-signed-out', { projectId: auth.app.options.projectId, pathname, requestId: current });
          setUser(null);
          setProfile(null);
          setError(null);
          setLoading(false);
          return;
        }
        logAuthEvent('auth-state-signed-in-profile-load-started', {
          projectId: auth.app.options.projectId,
          pathname,
          uid: firebaseUser.uid,
          providerIds: firebaseUser.providerData.map((provider) => provider.providerId),
          emailVerified: firebaseUser.emailVerified,
          requestId: current,
        });
        void loadOrCreateProfile(firebaseUser)
          .then((nextProfile) => {
            if (current !== requestId || cancelled) {
              logAuthEvent('profile-load-result-ignored-as-stale', { uid: firebaseUser.uid, requestId: current });
              return;
            }
            logAuthEvent('profile-load-succeeded', {
              projectId: auth.app.options.projectId,
              uid: firebaseUser.uid,
              profileCompleted: nextProfile.profileCompleted,
              requestId: current,
            });
            setUser(firebaseUser);
            setProfile(nextProfile);
            setError(null);
            setLoading(false);
          })
          .catch((loadError: unknown) => {
            if (current !== requestId || cancelled) {
              logAuthEvent('profile-load-error-ignored-as-stale', { uid: firebaseUser.uid, requestId: current });
              return;
            }
            logAuthFailure('profile-load-failed', loadError, {
              projectId: auth.app.options.projectId,
              uid: firebaseUser.uid,
              requestId: current,
            });
            setUser(firebaseUser);
            setProfile(null);
            setError(actionError(loadError));
            setLoading(false);
          });
      }, (listenerError) => {
        logAuthFailure('auth-state-listener-failed', listenerError, { projectId: auth.app.options.projectId, pathname });
        setSignInError(actionError(listenerError));
        setLoading(false);
      });
    })();
    return () => {
      cancelled = true;
      requestId += 1;
      unsubscribe();
      logAuthEvent('auth-provider-cleaned-up', { projectId: auth.app.options.projectId, pathname, requestId });
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
        logAuthEvent('google-sign-in-action-started', { projectId: getFirebase().auth.app.options.projectId });
        try {
          await signInWithGoogleAccount(getFirebase().auth);
          logAuthEvent('google-sign-in-action-returned', { projectId: getFirebase().auth.app.options.projectId });
        } catch (signInFailure) {
          logAuthFailure('google-sign-in-action-failed', signInFailure, { projectId: getFirebase().auth.app.options.projectId });
          setSignInError(actionError(signInFailure));
          throw signInFailure;
        }
      },
      async signOutUser() {
        const { auth } = getFirebase();
        const currentUid = auth.currentUser?.uid;
        logAuthEvent('sign-out-started', { projectId: auth.app.options.projectId, uid: currentUid });
        try {
          await signOut(auth);
          setUser(null);
          setProfile(null);
          logAuthEvent('sign-out-succeeded', { projectId: auth.app.options.projectId, uid: currentUid });
        } catch (signOutFailure) {
          logAuthFailure('sign-out-failed', signOutFailure, { projectId: auth.app.options.projectId, uid: currentUid });
          throw signOutFailure;
        }
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
