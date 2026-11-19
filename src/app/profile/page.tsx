'use client';

import { useEffect, useState } from 'react';
import { DeviceNotices } from '@/components/DeviceNotices';
import { ProfileForm } from '@/components/ProfileForm';
import { useAuth } from '@/components/AuthProvider';
import { AppShell } from '@/components/TopBar';
import { Button, FormError, LoadingScreen, Spinner, pageTitleClass } from '@/components/ui';
import { claimAccountDeletion, eraseOwnAccount, finishAccountDeletion } from '@/lib/account';
import { actionError } from '@/lib/errors';
import { useTheme } from '@/components/ThemeProvider';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase';
import { loadStudyMemberships } from '@/lib/studies';

export default function ProfilePage() {
  const { user, profile, signOutUser } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState({ hosted: 0, joined: 0, circles: 0 });

  useEffect(() => {
    if (!user) return;
    const { db } = getFirebase();
    void Promise.all([
      getDocs(query(collection(db, 'studies'), where('hostId', '==', user.uid))),
      loadStudyMemberships(user.uid),
    ]).then(([hosted, memberships]) => {
      setActivity({ hosted: hosted.size, joined: memberships.filter((membership) => membership.status === 'approved').length, circles: 0 });
    }).catch(() => {
      // Activity is supplementary; keep the profile usable if a count query is unavailable.
    });
  }, [user]);

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
        <details open className="mt-6 rounded-lg border border-line bg-card px-4 shadow-sm">
          <summary className="cursor-pointer list-none py-4 font-serif text-xl">Profile</summary>
          <div className="border-t border-line pb-4">
            <ProfileForm mode="edit" initial={profile} activity={activity} />
          </div>
        </details>
        <details className="mt-4 rounded-lg border border-line bg-card px-4 shadow-sm">
          <summary className="cursor-pointer list-none py-4 font-serif text-xl">Settings</summary>
          <div className="border-t border-line pb-4">
            <DeviceNotices />
            <section className="mt-6 rounded-lg border border-line bg-card p-4 shadow-sm transition-all duration-300">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-serif text-xl">Appearance</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">Choose a light or dark view for Komunyon.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={theme === 'dark'}
              onClick={toggleTheme}
              className="relative inline-flex h-10 w-[4.5rem] shrink-0 items-center rounded-full border border-line bg-sand p-1 transition-colors duration-300 focus-visible:outline-offset-4"
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              <span className={`inline-flex size-8 items-center justify-center rounded-full bg-card text-sm shadow-sm transition-transform duration-300 ${theme === 'dark' ? 'translate-x-8' : ''}`}>
                {theme === 'dark' ? '☾' : '☀'}
              </span>
            </button>
          </div>
          <p className="mt-3 text-xs text-muted" aria-live="polite">{theme === 'dark' ? 'Dark mode on' : 'Light mode on'}</p>
            </section>
            <section className="mt-8 border-t border-line pt-6">
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
        </details>
        <details className="mt-4 rounded-lg border border-line bg-card px-4 shadow-sm">
          <summary className="cursor-pointer list-none py-4 font-serif text-xl">FAQ</summary>
          <div className="border-t border-line pb-4">
            <div className="divide-y divide-line">
              <details className="py-3">
                <summary className="cursor-pointer text-sm font-medium">How does approval work?</summary>
                <p className="mt-2 text-sm leading-relaxed text-muted">Request to join a study and wait for the host or authorized co-host to approve you.</p>
              </details>
              <details className="py-3">
                <summary className="cursor-pointer text-sm font-medium">When can I see the address?</summary>
                <p className="mt-2 text-sm leading-relaxed text-muted">The address is shown only after the host approves you.</p>
              </details>
              <details className="py-3">
                <summary className="cursor-pointer text-sm font-medium">How do I leave a study?</summary>
                <p className="mt-2 text-sm leading-relaxed text-muted">Open the study and choose Leave group. Dashboard cards do not remove your membership.</p>
              </details>
              <details className="py-3">
                <summary className="cursor-pointer text-sm font-medium">How do I install Komunyon on iPhone?</summary>
                <p className="mt-2 text-sm leading-relaxed text-muted">Open Komunyon in Safari, tap Share, choose Add to Home Screen, and tap Add.</p>
              </details>
              <details className="py-3">
                <summary className="cursor-pointer text-sm font-medium">How do I install Komunyon on Android?</summary>
                <p className="mt-2 text-sm leading-relaxed text-muted">Open Komunyon in Chrome, tap the three-dot menu, choose Install app or Add to Home screen, and confirm.</p>
              </details>
            </div>
          </div>
        </details>
      </div>
    </AppShell>
  );
}
