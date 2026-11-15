'use client';

import { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { Alert, Spinner } from '@/components/ui';
import { actionError } from '@/lib/errors';
import { missingFirebaseEnv } from '@/lib/firebase';

export default function HomePage() {
  const { signInWithGoogle, prepareGoogleSignIn, configured, signInError } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const missing = missingFirebaseEnv();

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (failure) {
      setError(actionError(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-8">
      <header className="flex items-center justify-between">
        <span className="font-serif text-lg">Komunyon</span>
        <span className="text-sm text-muted">The Hague</span>
      </header>

      <main className="flex max-w-xl flex-1 flex-col justify-center py-16">
        <p className="text-sm font-medium text-canal">Bible studies &amp; communion</p>
        <h1 className="mt-3 font-serif text-4xl leading-tight sm:text-5xl">A seat at the table, in The Hague.</h1>
        <p className="mt-5 max-w-md text-base leading-relaxed text-muted">
          Host a group or ask to join one. People can see the neighbourhood, the time, and who is hosting. The street
          address opens only after the host approves you.
        </p>

        {configured ? (
          <div className="mt-8 flex flex-col items-start gap-3">
            {error || signInError ? <Alert>{error || signInError}</Alert> : null}
            <button
              type="button"
              onPointerDown={() => prepareGoogleSignIn()}
              onClick={() => void signIn()}
              disabled={busy}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-medium text-ink transition hover:bg-sand disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <Spinner /> : <GoogleMark />}
              Sign in with Google
            </button>
          </div>
        ) : (
          <div className="mt-8 max-w-md rounded-lg border border-line bg-card p-4">
            <p className="text-sm font-medium">Add your Firebase web config to continue.</p>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Copy <code className="text-ink">.env.example</code> to <code className="text-ink">.env.local</code>, then
              deploy <code className="text-ink">firestore.rules</code> and <code className="text-ink">storage.rules</code>.
            </p>
            <ul className="mt-3 space-y-1 font-mono text-xs text-ink">
              {missing.map((key) => (
                <li key={key}>{key}</li>
              ))}
            </ul>
          </div>
        )}
      </main>

      <footer className="text-sm text-muted">The Hague only · Hosts approve each person · You can host and join</footer>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
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
