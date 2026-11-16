'use client';

import { ProfileForm } from '@/components/ProfileForm';
import { useAuth } from '@/components/AuthProvider';
import { LoadingScreen, pageTitleClass } from '@/components/ui';

export default function OnboardingPage() {
  const { profile, signOutUser } = useAuth();
  if (!profile) return <LoadingScreen />;

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex h-14 w-full max-w-lg items-center justify-between px-4 pt-[env(safe-area-inset-top)] sm:h-16">
        <span className="font-serif text-lg">Komunyon</span>
        <button type="button" onClick={() => void signOutUser()} className="text-sm text-muted hover:text-ink">
          Sign out
        </button>
      </header>
      <main className="mx-auto w-full max-w-lg px-4 pb-[max(4rem,env(safe-area-inset-bottom))]">
        <p className="text-sm font-medium text-canal">The Hague</p>
        <h1 className={`mt-2 ${pageTitleClass}`}>Set up your profile</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Hosts see your name, age, photo, and bio when you request a place. You can change these later.
        </p>
        <ProfileForm mode="onboarding" initial={profile} />
      </main>
    </div>
  );
}
