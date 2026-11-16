'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { draftFromStudy, StudyForm } from '@/components/StudyForm';
import { useAuth } from '@/components/AuthProvider';
import { AppShell } from '@/components/TopBar';
import { Alert, LoadingScreen, pageTitleClass } from '@/components/ui';
import { actionError } from '@/lib/errors';
import { getPrivateDetails, getStudy, updateStudy } from '@/lib/studies';
import type { BibleStudy, PrivateStudyDetails } from '@/types';

export default function EditStudyPage() {
  const params = useParams();
  const studyId = typeof params.id === 'string' ? params.id : '';
  const router = useRouter();
  const { user, profile } = useAuth();
  const [study, setStudy] = useState<BibleStudy | null>(null);
  const [details, setDetails] = useState<PrivateStudyDetails | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!studyId || !user) return;
    let active = true;
    void (async () => {
      try {
        const nextStudy = await getStudy(studyId);
        if (!active) return;
        setStudy(nextStudy);
        if (nextStudy && nextStudy.hostId === user.uid) {
          setDetails(await getPrivateDetails(studyId));
        }
      } catch (failure) {
        if (!active) return;
        setError(actionError(failure));
      } finally {
        if (active) setLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [studyId, user]);

  useEffect(() => {
    if (study && user && study.hostId !== user.uid) {
      router.replace(`/studies/${study.id}`);
    }
  }, [router, study, user]);

  if (!user || !profile) return <LoadingScreen />;
  if (!loaded) {
    return (
      <AppShell>
        <p className="text-sm text-muted">Loading study…</p>
      </AppShell>
    );
  }
  if (!study) {
    return (
      <AppShell>
        {error ? <Alert>{error}</Alert> : <p className="font-serif text-3xl">This study is no longer listed.</p>}
        <Link href="/dashboard" className="mt-4 inline-block text-sm text-canal">
          Back to studies
        </Link>
      </AppShell>
    );
  }
  if (study.hostId !== user.uid) {
    return (
      <AppShell>
        <p className="text-sm text-muted">Only the host can edit this study.</p>
      </AppShell>
    );
  }

  const minCapacity = Math.max(1, study.approvedUserIds.length);

  return (
    <AppShell>
      <Link href={`/studies/${study.id}`} className="block truncate text-sm text-muted hover:text-ink">
        ← {study.title}
      </Link>
      <h1 className={`mt-3 ${pageTitleClass}`}>Edit study</h1>
      {error ? (
        <div className="mt-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      <div className="max-w-2xl">
        <StudyForm
          initial={draftFromStudy(study, details)}
          minCapacity={minCapacity}
          submitLabel="Save changes"
          onSubmit={async (draft) => {
            await updateStudy(study.id, profile, draft);
            router.push(`/studies/${study.id}`);
          }}
        />
      </div>
    </AppShell>
  );
}
