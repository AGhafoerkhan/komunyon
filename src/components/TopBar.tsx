'use client';

import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { Avatar, buttonClass } from '@/components/ui';

export function TopBar() {
  const { profile, signOutUser } = useAuth();
  const name = profile?.fullName || 'My Profile';

  return (
    <header className="sticky top-0 z-10 border-b border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/dashboard" className="font-serif text-lg leading-none">
          Komunyon
        </Link>
        <span className="text-sm text-muted">The Hague</span>
        <div className="ml-auto flex flex-wrap items-center gap-1 sm:gap-2">
          <Link href="/profile" className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-sand">
            <Avatar src={profile?.photoURL ?? ''} name={name} size={28} />
            <span>My Profile</span>
          </Link>
          <button type="button" onClick={() => void signOutUser()} className={`${buttonClass('ghost', 'sm')} px-2`}>
            Sign out
          </button>
          <Link href="/studies/new" className={buttonClass('primary', 'sm')}>
            + Host a Bible Study
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
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
