'use client';

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { AppShell } from '@/components/TopBar';
import { Alert, Button, LoadingScreen, pageTitleClass } from '@/components/ui';
import { actionError } from '@/lib/errors';
import { getFirebase } from '@/lib/firebase';
import { getStudy } from '@/lib/studies';

export default function CoHostAdminPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const studyId = typeof params.id === 'string' ? params.id : '';
  const uid = searchParams.get('uid') ?? '';
  const { user } = useAuth();
  const [name, setName] = useState('Co-host');
  const [canEdit, setCanEdit] = useState(false);
  const [canManageParticipants, setCanManageParticipants] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !studyId || !uid) return;
    let active = true;
    void Promise.all([
      getStudy(studyId),
      getDoc(doc(getFirebase().db, 'studies', studyId, 'managers', uid)),
    ])
      .then(([study, manager]) => {
        if (!active) return;
        if (!study || study.hostId !== user.uid || !study.approvedUserIds.includes(uid)) {
          setError('Only the primary host can manage an approved co-host.');
          setLoaded(true);
          return;
        }
        setName(study.approvedUserIds.includes(uid) ? 'Assigned co-host' : 'Co-host');
        setCanEdit(manager.exists() && manager.data().permissions?.canEdit === true);
        setCanManageParticipants(manager.exists() && manager.data().permissions?.canManageParticipants === true);
        setLoaded(true);
      })
      .catch((failure: unknown) => {
        if (active) {
          setError(actionError(failure));
          setLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, [studyId, uid, user]);

  async function save() {
    if (!user || !studyId || !uid) return;
    setSaving(true);
    setError(null);
    try {
      const study = await getStudy(studyId);
      if (!study || study.hostId !== user.uid) throw new Error('Only the primary host can manage co-host access.');
      await setDoc(doc(getFirebase().db, 'studies', studyId, 'managers', uid), {
        uid,
        permissions: { canEdit, canManageParticipants },
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    } catch (failure) {
      setError(actionError(failure));
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return <LoadingScreen />;

  return (
    <AppShell>
      <div className="mx-auto max-w-lg">
        <p className="text-sm text-muted">Co-host admin access</p>
        <h1 className={`mt-2 ${pageTitleClass}`}>{name}</h1>
        {error ? <div className="mt-5"><Alert>{error}</Alert></div> : (
          <section className="mt-6 rounded-lg border border-line bg-card p-4">
            <div className="flex items-center justify-between gap-4">
              <span>
                <span className="block font-medium">Can edit this study</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">Allow this co-host to use the Edit study page.</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={canEdit}
                aria-label="Can edit this study"
                onClick={() => setCanEdit((current) => !current)}
                className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border p-1 transition-colors duration-200 ${canEdit ? 'border-canal bg-canal' : 'border-line bg-sand'}`}
              >
                <span className={`size-6 rounded-full bg-card shadow-sm transition-transform duration-200 ${canEdit ? 'translate-x-6' : 'translate-x-0'}`} />
                <span className={`absolute inset-0 flex items-center text-[10px] font-medium ${canEdit ? 'justify-start pl-2 text-white' : 'justify-end pr-2 text-muted'}`}>
                  {canEdit ? 'ON' : 'OFF'}
                </span>
              </button>
            </div>
            <Button className="mt-5" onClick={() => void save()} disabled={saving}>
              {saving ? 'Saving…' : 'Save access'}
            </Button>
            <div className="mt-6 flex items-center justify-between gap-4 border-t border-line pt-5">
              <span>
                <span className="block font-medium">Can manage participants</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">Allow this co-host to approve and manage participants.</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={canManageParticipants}
                aria-label="Can manage participants"
                onClick={() => setCanManageParticipants((current) => !current)}
                className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border p-1 transition-colors duration-200 ${canManageParticipants ? 'border-canal bg-canal' : 'border-line bg-sand'}`}
              >
                <span className={`size-6 rounded-full bg-card shadow-sm transition-transform duration-200 ${canManageParticipants ? 'translate-x-6' : 'translate-x-0'}`} />
                <span className={`absolute inset-0 flex items-center text-[10px] font-medium ${canManageParticipants ? 'justify-start pl-2 text-white' : 'justify-end pr-2 text-muted'}`}>
                  {canManageParticipants ? 'ON' : 'OFF'}
                </span>
              </button>
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
