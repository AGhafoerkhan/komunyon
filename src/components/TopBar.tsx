'use client';

import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { Avatar, buttonClass } from '@/components/ui';

export function TopBar() {
  const { profile, signOutUser } = useAuth();
  const name = profile?.fullName || 'My Profile';

  return (
    <header className="sticky top-0 z-10 border-b border-line bg-paper/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-2 px-4 sm:h-16 sm:gap-3 sm:px-6">
        <Link href="/dashboard" className="shrink-0 font-serif text-lg leading-none">
          Komunyon
        </Link>
        <span className="hidden truncate text-sm text-muted sm:inline">The Hague</span>
        <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-2">
          <Link
            href="/profile"
            aria-label="My profile"
            className="inline-flex h-10 min-w-0 items-center gap-2 rounded-md px-1.5 text-sm hover:bg-sand sm:px-2"
          >
            <Avatar src={profile?.photoURL ?? ''} name={name} size={28} />
            <span className="hidden truncate sm:inline">My Profile</span>
          </Link>
          <button type="button" onClick={() => void signOutUser()} className={`${buttonClass('ghost', 'sm')} px-2`}>
            Sign out
          </button>
          <Link href="/studies/new" className={`${buttonClass('primary', 'sm')} shrink-0`}>
            <span className="sm:hidden">Host</span>
            <span className="hidden sm:inline">Host a study</span>
          </Link>
        </div>
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <TopBar />
      <main className="mx-auto w-full max-w-5xl px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
