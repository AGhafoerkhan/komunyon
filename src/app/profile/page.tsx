'use client';

import { ProfileForm } from '@/components/ProfileForm';
import { useAuth } from '@/components/AuthProvider';
import { AppShell } from '@/components/TopBar';
import { LoadingScreen } from '@/components/ui';

export default function ProfilePage() {
  const { profile } = useAuth();
  if (!profile) return <LoadingScreen />;

  return (
    <AppShell>
      <div className="mx-auto max-w-lg">
        <h1 className="font-serif text-4xl">My profile</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          This is what hosts see with a join request, and what appears on studies you host.
        </p>
        <ProfileForm mode="edit" initial={profile} />
      </div>
    </AppShell>
  );
}
