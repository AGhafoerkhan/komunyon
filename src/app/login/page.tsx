'use client';

import { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { Spinner } from '@/components/ui';
import { OFFLINE_AUTH_MESSAGE, SIGN_IN_CANCELLED_MESSAGE } from '@/lib/errors';

export default function LoginPage() {
  const { signInWithGoogle, prepareGoogleSignIn, signInError } = useAuth();
  const [busy, setBusy] = useState(false);
  const message = signInError;

  async function signIn() {
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch {
      // AuthProvider records one detailed issue with the correct sign-in stage.
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-paper p-4">
      <div className="w-full max-w-xs rounded-lg border border-line bg-card p-6">
        <h1 className="mb-4 font-serif text-2xl">Sign in</h1>
        <button
          type="button"
          aria-busy={busy}
          onPointerDown={prepareGoogleSignIn}
          onFocus={prepareGoogleSignIn}
          onClick={() => void signIn()}
          disabled={busy}
          className="inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-md border border-line bg-paper px-3 py-2 text-sm font-medium transition hover:border-canal disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Spinner /> : <GoogleMark />}
          Sign in with Google
        </button>
        {message === SIGN_IN_CANCELLED_MESSAGE || message === OFFLINE_AUTH_MESSAGE ? (
          <p role="alert" className="mt-3 text-sm text-clay">
            {message}
          </p>
        ) : null}
      </div>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}
