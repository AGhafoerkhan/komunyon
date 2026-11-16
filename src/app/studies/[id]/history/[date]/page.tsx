'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { SessionRecord } from '@/components/SessionRecord';
import { useAuth } from '@/components/AuthProvider';
import { AppShell } from '@/components/TopBar';
import { Alert, pageTitleClass } from '@/components/ui';
import { actionError } from '@/lib/errors';
import { formatDdMmYyyy, historySessions } from '@/lib/format';
import { isIsoDate } from '@/lib/guards';
import { listAnchoredSessionDates } from '@/lib/sessions';
import { subscribeStudy } from '@/lib/studies';
import type { BibleStudy } from '@/types';

export default function StudySessionPage() {
  const params = useParams();
  const studyId = typeof params.id === 'string' ? params.id : '';
  const date = typeof params.date === 'string' ? params.date : '';
  const { user } = useAuth();
  const [study, setStudy] = useState<BibleStudy | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [anchored, setAnchored] = useState<string[] | null>(null);
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

  const allowed = Boolean(study && user && (study.hostId === user.uid || study.approvedUserIds.includes(user.uid)));

  useEffect(() => {
    if (!studyId || !allowed) return;
    let active = true;
    void listAnchoredSessionDates(studyId)
      .then((found) => {
        if (active) setAnchored(found);
      })
      .catch(() => {
        if (active) setAnchored([]);
      });
    return () => {
      active = false;
    };
  }, [studyId, allowed]);

  if (!user) return null;

  const known = Boolean(study && anchored && historySessions(study, 8, new Date(), anchored).includes(date));

  return (
    <AppShell>
      <Link href={`/studies/${studyId}/history`} className="inline-flex text-sm text-muted hover:text-ink">
        ← History
      </Link>
      <h1 className={`mt-3 ${pageTitleClass}`}>{isIsoDate(date) ? formatDdMmYyyy(date) : 'Session'}</h1>
      {!loaded ? <p className="mt-6 text-sm text-muted">Loading session…</p> : null}
      {error ? (
        <div className="mt-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      {loaded && !study ? <p className="mt-6 font-serif text-3xl">This study is no longer listed.</p> : null}
      {loaded && study && !allowed ? (
        <p className="mt-6 text-sm text-muted">The host and approved members can open this session.</p>
      ) : null}
      {loaded && study && allowed && anchored === null ? <p className="mt-6 text-sm text-muted">Loading session…</p> : null}
      {loaded && study && allowed && anchored !== null && !known ? (
        <p className="mt-6 text-sm text-muted">This date is not a session of this study.</p>
      ) : null}
      {study && allowed && known ? (
        <SessionRecord studyId={study.id} date={date} isHost={study.hostId === user.uid} />
      ) : null}
    </AppShell>
  );
}
