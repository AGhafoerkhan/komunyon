'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { isProfileReady } from '@/lib/validate';
import { Button, LoadingScreen } from '@/components/ui';

const RETURN_KEY = 'komunyon-return';

function isSharedStudy(pathname: string): boolean {
  return /^\/studies\/[^/]+$/.test(pathname);
}

export function rememberStudyLink(studyId: string): void {
  sessionStorage.setItem(RETURN_KEY, `/studies/${studyId}`);
}

export function clearStudyLink(studyId: string): void {
  if (sessionStorage.getItem(RETURN_KEY) === `/studies/${studyId}`) sessionStorage.removeItem(RETURN_KEY);
}

function peekStudyLink(): string | null {
  const value = sessionStorage.getItem(RETURN_KEY);
  if (!value || !isSharedStudy(value)) return null;
  return value;
}

export function RouteGuard({ children }: { children: ReactNode }) {
  const { user, profile, loading, error, configured, signOutUser } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const completed = isProfileReady(profile);

  useEffect(() => {
    if (!configured) {
      if (pathname !== '/') router.replace('/');
      return;
    }
    if (loading) return;
    if (error) return;

    if (!user) {
      if (pathname !== '/' && !isSharedStudy(pathname)) router.replace('/');
      return;
    }
    if (!completed && pathname !== '/onboarding') {
      if (isSharedStudy(pathname)) sessionStorage.setItem(RETURN_KEY, pathname);
      router.replace('/onboarding');
      return;
    }
    if (completed && (pathname === '/' || pathname === '/onboarding')) {
      const next = peekStudyLink();
      router.replace(next ?? '/dashboard');
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

  if (!user && pathname !== '/' && !isSharedStudy(pathname)) return <LoadingScreen label="Redirecting" />;
  if (user && !completed && pathname !== '/onboarding') return <LoadingScreen label="Redirecting" />;
  if (user && completed && (pathname === '/' || pathname === '/onboarding')) {
    return <LoadingScreen label="Redirecting" />;
  }

  return children;
}
