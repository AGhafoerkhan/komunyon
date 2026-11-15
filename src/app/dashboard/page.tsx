'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { StudyCard } from '@/components/StudyCard';
import { AppShell } from '@/components/TopBar';
import { useAuth } from '@/components/AuthProvider';
import { Alert, LoadingScreen, buttonClass } from '@/components/ui';
import { actionError } from '@/lib/errors';
import { subscribeStudies } from '@/lib/studies';
import type { BibleStudy } from '@/types';

export default function DashboardPage() {
  const { user } = useAuth();
  const [studies, setStudies] = useState<BibleStudy[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return subscribeStudies(
      (next) => {
        setStudies(next);
        setLoaded(true);
      },
      (failure) => {
        setError(actionError(failure));
        setLoaded(true);
      },
    );
  }, []);

  if (!user) return <LoadingScreen />;

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="font-serif text-4xl">Studies in The Hague</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
          Neighbourhood, time, and who is hosting. The street address stays hidden until you are approved.
        </p>
      </div>

      {error ? <Alert>{error}</Alert> : null}

      {!loaded ? (
        <p className="text-sm text-muted">Loading studies…</p>
      ) : studies.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line px-6 py-14 text-center">
          <p className="font-serif text-2xl">No studies in The Hague yet</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
            Host the first gathering. The address stays private until you approve someone.
          </p>
          <Link href="/studies/new" className={`${buttonClass('primary', 'sm')} mt-5`}>
            + Host a Bible Study
          </Link>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {studies.map((study) => (
            <li key={study.id}>
              <StudyCard study={study} viewerId={user.uid} />
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
