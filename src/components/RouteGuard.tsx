'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { Button, LoadingScreen } from '@/components/ui';

export function RouteGuard({ children }: { children: ReactNode }) {
  const { user, profile, loading, error, configured, signOutUser } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const completed = profile?.profileCompleted === true;

  useEffect(() => {
    if (!configured) {
      if (pathname !== '/') router.replace('/');
      return;
    }
    if (loading) return;
    if (error) return;

    if (!user) {
      if (pathname !== '/') router.replace('/');
      return;
    }
    if (!completed && pathname !== '/onboarding') {
      router.replace('/onboarding');
      return;
    }
    if (completed && (pathname === '/' || pathname === '/onboarding')) {
      router.replace('/dashboard');
    }
  }, [completed, configured, error, loading, pathname, router, user]);

  if (!configured && pathname !== '/') return <LoadingScreen label="Redirecting" />;
  if (!configured) return children;
  if (loading) return <LoadingScreen />;

  if (error) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6">
        <p className="font-serif text-3xl">Could not open your profile</p>
        <p className="text-sm text-muted">{error}</p>
        <div>
          <Button variant="secondary" onClick={() => void signOutUser()}>
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  if (!user && pathname !== '/') return <LoadingScreen label="Redirecting" />;
  if (user && !completed && pathname !== '/onboarding') return <LoadingScreen label="Redirecting" />;
  if (user && completed && (pathname === '/' || pathname === '/onboarding')) {
    return <LoadingScreen label="Redirecting" />;
  }

  return children;
}
