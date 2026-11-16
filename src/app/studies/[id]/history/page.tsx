'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { SessionPhotos } from '@/components/SessionPhotos';
import { useAuth } from '@/components/AuthProvider';
import { AppShell } from '@/components/TopBar';
import { Alert, pageTitleClass } from '@/components/ui';
import { actionError } from '@/lib/errors';
import { subscribeStudy } from '@/lib/studies';
import type { BibleStudy } from '@/types';

export default function StudyHistoryPage() {
  const params = useParams();
  const studyId = typeof params.id === 'string' ? params.id : '';
  const { user } = useAuth();
  const [study, setStudy] = useState<BibleStudy | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!studyId) return;
    return subscribeStudy(
      studyId,
      (next) => {
        setStudy(next);
        setLoaded(true);
      },
      (failure) => {
        setError(actionError(failure));
        setLoaded(true);
      },
    );
  }, [studyId]);

  if (!user) return null;

  const allowed = Boolean(study && (study.hostId === user.uid || study.approvedUserIds.includes(user.uid)));

  return (
    <AppShell>
      <Link href={`/studies/${studyId}`} className="inline-flex text-sm text-muted hover:text-ink">
        ← {study?.title ?? 'Study'}
      </Link>
      <h1 className={`mt-3 ${pageTitleClass}`}>History</h1>
      {!loaded ? <p className="mt-6 text-sm text-muted">Loading history…</p> : null}
      {error ? (
        <div className="mt-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      {loaded && !study ? <p className="mt-6 font-serif text-3xl">This study is no longer listed.</p> : null}
      {loaded && study && !allowed ? (
        <p className="mt-6 text-sm text-muted">The host and approved members can open this history.</p>
      ) : null}
      {study && allowed ? (
        <div className="mt-6">
          <SessionPhotos study={study} />
        </div>
      ) : null}
    </AppShell>
  );
}
