'use client';

import { ProfileForm } from '@/components/ProfileForm';
import { useAuth } from '@/components/AuthProvider';
import { LoadingScreen } from '@/components/ui';

export default function OnboardingPage() {
  const { profile, signOutUser } = useAuth();
  if (!profile) return <LoadingScreen />;

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex w-full max-w-lg items-center justify-between px-4 py-6">
        <span className="font-serif text-lg">Komunyon</span>
        <button type="button" onClick={() => void signOutUser()} className="text-sm text-muted hover:text-ink">
          Sign out
        </button>
      </header>
      <main className="mx-auto w-full max-w-lg px-4 pb-16">
        <p className="text-sm font-medium text-canal">The Hague</p>
        <h1 className="mt-2 font-serif text-4xl">Set up your profile</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Hosts see your name, age, Google photo, and bio when you request a place. You can change the written details later.
        </p>
        <ProfileForm mode="onboarding" initial={profile} />
      </main>
    </div>
  );
}
