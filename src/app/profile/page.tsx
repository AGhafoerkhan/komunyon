'use client';

import { useEffect, useState } from 'react';
import { DeviceNotices } from '@/components/DeviceNotices';
import { ProfileForm } from '@/components/ProfileForm';
import { useAuth } from '@/components/AuthProvider';
import { AppShell } from '@/components/TopBar';
import { Button, FormError, LoadingScreen, Spinner, pageTitleClass } from '@/components/ui';
import { claimAccountDeletion, eraseOwnAccount, finishAccountDeletion } from '@/lib/account';
import { actionError } from '@/lib/errors';

export default function ProfilePage() {
  const { user, profile, signOutUser } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !claimAccountDeletion()) return;
    setBusy(true);
    setError(null);
    void finishAccountDeletion(user).catch((failure: unknown) => {
      setError(actionError(failure));
      setBusy(false);
    });
  }, [user]);

  if (!profile || !user) return <LoadingScreen />;
  const currentUser = user;

  async function removeAccount() {
    setBusy(true);
    setError(null);
    try {
      const result = await eraseOwnAccount(currentUser);
      if (result === 'redirect') return;
    } catch (failure) {
      setError(actionError(failure));
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-lg">
        <h1 className={pageTitleClass}>My profile</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          This is what hosts see with a join request, and what appears on studies you host.
        </p>
        <ProfileForm mode="edit" initial={profile} />
        <DeviceNotices />
        <section className="mt-10 border-t border-line pt-6">
          <h2 className="font-serif text-xl">Account</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">Sign out of Komunyon on this device.</p>
          <Button variant="secondary" className="mt-4 w-full sm:w-auto" onClick={() => void signOutUser()} disabled={busy}>
            Sign out
          </Button>

          <h2 className="mt-8 font-serif text-xl">Delete account</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            This deletes your profile and every study you host. People in those studies are removed. If they still have one
            open, it says the study is no longer listed.
          </p>
          {error ? (
            <div className="mt-4">
              <FormError>{error}</FormError>
            </div>
          ) : null}
          {confirming ? (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Button variant="danger" className="w-full sm:w-auto" onClick={() => void removeAccount()} disabled={busy}>
                {busy ? <Spinner /> : null}
                Delete account
              </Button>
              <Button
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={() => {
                  setConfirming(false);
                  setError(null);
                }}
                disabled={busy}
              >
                Keep account
              </Button>
            </div>
          ) : (
            <Button variant="danger" className="mt-4 w-full sm:w-auto" onClick={() => setConfirming(true)} disabled={busy}>
              Delete account
            </Button>
          )}
        </section>
      </div>
    </AppShell>
  );
}
