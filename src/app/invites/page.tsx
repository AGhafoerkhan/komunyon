'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { AppShell } from '@/components/TopBar';
import { Alert, Avatar, Button, LoadingScreen, pageTitleClass } from '@/components/ui';
import { actionError } from '@/lib/errors';
import { formatSchedule } from '@/lib/format';
import { acceptInvite, declineInvite, subscribeInvitedStudies } from '@/lib/studies';
import type { BibleStudy } from '@/types';

export default function InvitesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [studies, setStudies] = useState<BibleStudy[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    return subscribeInvitedStudies(
      user.uid,
      (next) => {
        setStudies(next);
        setLoaded(true);
      },
      (failure) => {
        setError(actionError(failure));
        setLoaded(true);
      },
    );
  }, [user]);

  async function respond(study: BibleStudy, kind: 'accept' | 'decline') {
    if (!user) return;
    setBusy(`${kind}:${study.id}`);
    setError(null);
    try {
      if (kind === 'accept') {
        await acceptInvite(study, user.uid);
        router.push(`/studies/${study.id}`);
        return;
      }
      await declineInvite(study.id, user.uid);
    } catch (failure) {
      setError(actionError(failure));
    } finally {
      setBusy(null);
    }
  }

  if (!user) return <LoadingScreen />;

  return (
    <AppShell>
      <h1 className={pageTitleClass}>Invites</h1>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
        A host asked you to a study. The address stays hidden until you accept.
      </p>
      {error ? (
        <div className="mt-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      {!loaded ? <p className="mt-6 text-sm text-muted">Loading invites…</p> : null}
      {loaded && studies.length === 0 ? <p className="mt-6 text-sm text-muted">No invites.</p> : null}
      {studies.length > 0 ? (
        <ul className="mt-6 border-t border-line">
          {studies.map((study) => {
            const full = study.approvedUserIds.length >= study.maxCapacity;
            return (
              <li key={study.id} className="flex flex-col gap-3 border-b border-line py-4 sm:flex-row sm:items-center">
                <Avatar src={study.hostPhotoURL} name={study.hostName} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{study.title}</p>
                  <p className="mt-0.5 text-sm text-muted">
                    {study.hostName} invited you · {study.area}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">{formatSchedule(study)}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" disabled={full || busy !== null} onClick={() => void respond(study, 'accept')}>
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy !== null}
                    onClick={() => void respond(study, 'decline')}
                  >
                    Decline
                  </Button>
                </div>
                {full ? <p className="text-xs text-muted sm:w-full">This study is full.</p> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </AppShell>
  );
}
