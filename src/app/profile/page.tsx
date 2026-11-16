'use client';

import { DeviceNotices } from '@/components/DeviceNotices';
import { ProfileForm } from '@/components/ProfileForm';
import { useAuth } from '@/components/AuthProvider';
import { AppShell } from '@/components/TopBar';
import { Button, LoadingScreen, pageTitleClass } from '@/components/ui';

export default function ProfilePage() {
  const { profile, signOutUser } = useAuth();
  if (!profile) return <LoadingScreen />;

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
          <Button variant="secondary" className="mt-4 w-full sm:w-auto" onClick={() => void signOutUser()}>
            Sign out
          </Button>
        </section>
      </div>
    </AppShell>
  );
}
