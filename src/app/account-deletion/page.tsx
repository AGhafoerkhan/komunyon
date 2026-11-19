'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { Button, FormError, LoadingScreen, Spinner } from '@/components/ui';
import { claimAccountDeletion, finishAccountDeletion } from '@/lib/account';
import { actionError } from '@/lib/errors';

export default function AccountDeletionPage() {
  const { user, profile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deleteAccount() {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      await finishAccountDeletion(user);
    } catch (failure) {
      setError(actionError(failure));
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!user || !profile || !claimAccountDeletion()) return;
    void deleteAccount();
  // The one-shot session marker starts deletion once after reauthentication.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, user]);

  if (!user || !profile) return <LoadingScreen label="Preparing account deletion" />;

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 px-6 py-12">
      <h1 className="font-serif text-3xl">Deleting your account</h1>
      <p className="text-sm leading-relaxed text-muted">
        Your profile and hosted studies are being removed. Keep this page open until the process finishes.
      </p>
      {error ? <FormError>{error}</FormError> : null}
      {error ? (
        <Button variant="danger" className="self-start" onClick={() => void deleteAccount()} disabled={busy}>
          {busy ? <Spinner /> : null}
          Try again
        </Button>
      ) : busy ? <p role="status" aria-live="polite">Removing your account…</p> : null}
    </main>
  );
}
