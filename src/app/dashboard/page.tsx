'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { StudyCard } from '@/components/StudyCard';
import { AppShell } from '@/components/TopBar';
import { useAuth } from '@/components/AuthProvider';
import { Alert, LoadingScreen, buttonClass, fieldClass, pageTitleClass } from '@/components/ui';
import { actionError } from '@/lib/errors';
import { isPastStudy } from '@/lib/format';
import {
  markUnlistedStudiesPublic,
  subscribeApprovedStudies,
  subscribeHostedStudies,
  subscribePublicStudies,
} from '@/lib/studies';
import type { BibleStudy } from '@/types';

export default function DashboardPage() {
  const { user } = useAuth();
  const [studies, setStudies] = useState<BibleStudy[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [studyFilter, setStudyFilter] = useState<'upcoming' | 'past'>('upcoming');
  const upcomingStudies = studies.filter((study) => !isPastStudy(study));
  const pastStudies = studies.filter((study) => isPastStudy(study));

  useEffect(() => {
    if (!user) return;
    let publicStudies: BibleStudy[] = [];
    let hostedStudies: BibleStudy[] = [];
    let memberStudies: BibleStudy[] = [];
    let publicReady = false;
    let hostedReady = false;
    let memberReady = false;

    const publish = () => {
      if (!publicReady || !hostedReady || !memberReady) return;
      const byId = new Map<string, BibleStudy>();
      for (const study of publicStudies) {
        if (study.isPublic) byId.set(study.id, study);
      }
      for (const study of hostedStudies) byId.set(study.id, study);
      for (const study of memberStudies) byId.set(study.id, study);
      setStudies([...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setLoaded(true);
    };

    const unsubPublic = subscribePublicStudies(
      user.uid,
      (next) => {
        publicStudies = next;
        publicReady = true;
        publish();
      },
      (failure) => {
        setError(actionError(failure));
        publicReady = true;
        publish();
      },
    );
    const unsubHosted = subscribeHostedStudies(
      user.uid,
      (next) => {
        hostedStudies = next;
        hostedReady = true;
        publish();
      },
      (failure) => {
        setError(actionError(failure));
        hostedReady = true;
        publish();
      },
    );
    const unsubMember = subscribeApprovedStudies(
      user.uid,
      (next) => {
        memberStudies = next;
        memberReady = true;
        publish();
      },
      (failure) => {
        setError(actionError(failure));
        memberReady = true;
        publish();
      },
    );
    void markUnlistedStudiesPublic().catch(() => undefined);

    return () => {
      unsubPublic();
      unsubHosted();
      unsubMember();
    };
  }, [user]);

  if (!user) return <LoadingScreen />;

  return (
    <AppShell>
      <div className="mb-6">
        <div className="flex items-start justify-between gap-3">
          <h1 className={`${pageTitleClass} min-w-0`}>Events in The Hague</h1>
          <Link href="/studies/new" className={`${buttonClass('primary', 'sm')} mt-1 shrink-0`}>
            Host an event
          </Link>
        </div>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
          Neighbourhood, time, and who is hosting. The street address stays hidden until you are approved to join.
        </p>
      </div>

      {error ? <Alert>{error}</Alert> : null}

      {!loaded ? (
        <p className="text-sm text-muted">Loading events…</p>
      ) : studies.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line px-4 py-10 text-center sm:px-6 sm:py-14">
          <p className="font-serif text-2xl">No events in The Hague yet</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
            Host the first event. The address stays private until you approve someone.
          </p>
          <Link href="/studies/new" className={`${buttonClass('primary', 'sm')} mt-5`}>
            + Host an event
          </Link>
        </div>
      ) : (
        <section>
          <label className="mb-4 flex max-w-xs items-center gap-3">
            <span className="shrink-0 text-sm font-medium">Show</span>
            <select className={fieldClass} value={studyFilter} onChange={(event) => setStudyFilter(event.target.value as 'upcoming' | 'past')}>
              <option value="upcoming">Upcoming</option>
              <option value="past">Past</option>
            </select>
          </label>
          {studyFilter === 'upcoming' ? (
            upcomingStudies.length ? (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {upcomingStudies.map((study) => <li key={study.id} className="min-w-0"><StudyCard study={study} viewerId={user.uid} /></li>)}
              </ul>
            ) : <p className="text-sm text-muted">No upcoming events.</p>
          ) : (
            pastStudies.length ? (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {pastStudies.map((study) => <li key={study.id} className="min-w-0"><StudyCard study={study} viewerId={user.uid} /></li>)}
              </ul>
            ) : <p className="text-sm text-muted">No past events.</p>
          )}
        </section>
      )}
    </AppShell>
  );
}
