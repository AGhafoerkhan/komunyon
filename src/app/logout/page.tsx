'use client';

import { useEffect } from 'react';
import { leaveCompletely } from '@/lib/logout';

export default function LogoutPage() {
  useEffect(() => {
    void leaveCompletely();
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6">
      <p className="font-serif text-3xl">Signing out…</p>
    </main>
  );
}
