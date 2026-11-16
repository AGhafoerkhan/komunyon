'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { SessionRecord } from '@/components/SessionRecord';
import { useAuth } from '@/components/AuthProvider';
import { AppShell } from '@/components/TopBar';
import { Alert, pageTitleClass } from '@/components/ui';
import { actionError } from '@/lib/errors';
import { formatDdMmYyyy, historySessions } from '@/lib/format';
import { isIsoDate } from '@/lib/guards';
import { debugLine } from '@/lib/sessionDebug';
import { subscribeStudy } from '@/lib/studies';
import type { BibleStudy } from '@/types';

export default function StudySessionPage() {
  const params = useParams();
  const studyId = typeof params.id === 'string' ? params.id : '';
  const date = typeof params.date === 'string' ? params.date : '';
  const { user } = useAuth();
  const [study, setStudy] = useState<BibleStudy | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugLines, setDebugLines] = useState<string[]>([]);
  const onDebug = useCallback((title: string, detail?: unknown) => {
    setDebugLines((current) => [...current, debugLine(title, detail)].slice(-60));
  }, []);

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

  useEffect(() => {
    if (!user || !loaded) return;
    onDebug('page', {
      href: window.location.href,
      online: navigator.onLine,
      userAgent: navigator.userAgent,
      studyId,
      date,
      validDate: isIsoDate(date),
      studyFound: Boolean(study),
      hostId: study?.hostId ?? null,
      uid: user.uid,
      email: user.email,
      isHost: study ? study.hostId === user.uid : false,
      approved: study ? study.approvedUserIds.includes(user.uid) : false,
      skippedDates: study?.skippedDates ?? [],
      shownDates: study ? historySessions(study) : [],
      allowed: Boolean(study && (study.hostId === user.uid || study.approvedUserIds.includes(user.uid))),
      known: Boolean(study && historySessions(study).includes(date)),
    });
  }, [user, loaded, study, studyId, date, onDebug]);

  if (!user) return null;

  const allowed = Boolean(study && (study.hostId === user.uid || study.approvedUserIds.includes(user.uid)));
  const known = Boolean(study && historySessions(study).includes(date));

  return (
    <AppShell>
      <Link href={`/studies/${studyId}/history`} className="inline-flex text-sm text-muted hover:text-ink">
        ← History
      </Link>
      <h1 className={`mt-3 ${pageTitleClass}`}>{isIsoDate(date) ? formatDdMmYyyy(date) : 'Session'}</h1>
      <section className="mt-4">
        <h2 className="text-sm font-medium text-ink">Debug</h2>
        <pre className="mt-2 max-h-[32rem] overflow-auto whitespace-pre-wrap break-all rounded-lg bg-ink p-3 text-xs leading-relaxed text-white">
          {debugLines.length > 0 ? debugLines.join('\n\n') : 'Waiting for the session to report.'}
        </pre>
      </section>
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
      {loaded && study && allowed && !known ? (
        <p className="mt-6 text-sm text-muted">This date is not a session of this study.</p>
      ) : null}
      {study && allowed && known ? (
        <SessionRecord
          studyId={study.id}
          date={date}
          hostId={study.hostId}
          isHost={study.hostId === user.uid}
          onDebug={onDebug}
        />
      ) : null}
    </AppShell>
  );
}
