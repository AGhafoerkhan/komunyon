'use client';

import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { JoinNotices } from '@/components/JoinNotices';
import { Avatar, buttonClass } from '@/components/ui';

export function TopBar() {
  const { profile } = useAuth();
  const name = profile?.fullName || 'My Profile';

  return (
    <header className="sticky top-0 z-10 border-b border-line bg-paper/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-2 px-4 sm:h-16 sm:gap-3 sm:px-6">
        <Link href="/dashboard" className="shrink-0 font-serif text-lg leading-none">
          Komunyon
        </Link>
        <span className="hidden truncate text-sm text-muted sm:inline">The Hague</span>
        <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-2">
          <JoinNotices />
          <Link
            href="/profile"
            aria-label="My profile"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md hover:bg-sand"
          >
            <Avatar src={profile?.photoURL ?? ''} name={name} size={28} />
          </Link>
          <button type="button" className={`${buttonClass('secondary', 'sm')} shrink-0`}>
            Invites
          </button>
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
