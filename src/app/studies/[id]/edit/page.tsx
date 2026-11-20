'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { draftFromStudy, StudyForm } from '@/components/StudyForm';
import { useAuth } from '@/components/AuthProvider';
import { AppShell } from '@/components/TopBar';
import { Alert, LoadingScreen, pageTitleClass } from '@/components/ui';
import { actionError } from '@/lib/errors';
import { getPrivateDetails, getStudy, subscribeCoHostEditPermission, updateStudy } from '@/lib/studies';
import { loadProfile } from '@/lib/users';
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
  const [canEdit, setCanEdit] = useState(false);
  const [hostProfile, setHostProfile] = useState(profile);
  const [permissionChecked, setPermissionChecked] = useState(false);

  useEffect(() => {
    if (!studyId || !user) return;
    let active = true;
    void (async () => {
      try {
        const nextStudy = await getStudy(studyId);
        if (!active) return;
        setStudy(nextStudy);
        if (nextStudy && nextStudy.hostId === user.uid) {
          const nextDetails = await getPrivateDetails(studyId);
          if (!active) return;
          setDetails(nextDetails);
          setCanEdit(true);
        } else if (nextStudy) {
          const [nextHostProfile, nextDetails] = await Promise.all([
            loadProfile(nextStudy.hostId),
            getPrivateDetails(studyId),
          ]);
          if (!active) return;
          setHostProfile(nextHostProfile);
          setDetails(nextDetails);
        }
        setPermissionChecked(true);
      } catch (failure) {
        if (!active) return;
        setError(actionError(failure));
      } finally {
        if (active) {
          setPermissionChecked(true);
          setLoaded(true);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [studyId, user]);

  useEffect(() => {
    if (!study || !user || study.hostId === user.uid) return;
    setPermissionChecked(false);
    return subscribeCoHostEditPermission(
      study.id,
      user.uid,
      (allowed) => {
        setCanEdit(allowed);
        setPermissionChecked(true);
      },
      () => {
        setCanEdit(false);
        setPermissionChecked(true);
      },
    );
  }, [study, user]);

  useEffect(() => {
    if (study && user && permissionChecked && study.hostId !== user.uid && !canEdit) {
      router.replace(`/studies/${study.id}`);
    }
  }, [canEdit, permissionChecked, router, study, user]);

  if (!user || !profile) return <LoadingScreen />;
  if (!loaded || !permissionChecked) {
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
  if (study.hostId !== user.uid && !canEdit) {
    return (
      <AppShell>
        <p className="text-sm text-muted">Only the host can edit this study.</p>
      </AppShell>
    );
  }

  const minCapacity = 1;

  return (
    <AppShell>
      <Link href={`/studies/${study.id}`} className="block truncate text-sm text-muted hover:text-ink">
        ← {study.title}
      </Link>
      <h1 className={`mt-3 ${pageTitleClass}`}>Edit event</h1>
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
          successMessage="Study changes saved."
          draftId={study.id}
          sourceVersion={`${study.updatedAt}:${details?.updatedAt ?? ''}`}
          onSubmit={async (draft) => {
            await updateStudy(study.id, hostProfile ?? profile, draft, study.createdAt);
            router.push(`/studies/${study.id}`);
          }}
        />
      </div>
    </AppShell>
  );
}
