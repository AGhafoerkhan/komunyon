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
        permissions: { canEdit },
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
            <label className="flex items-start gap-3">
              <input className="mt-1 size-4" type="checkbox" checked={canEdit} onChange={(event) => setCanEdit(event.target.checked)} />
              <span>
                <span className="block font-medium">Can edit this study</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">Allow this co-host to use the Edit study page.</span>
              </span>
            </label>
            <Button className="mt-5" onClick={() => void save()} disabled={saving}>
              {saving ? 'Saving…' : 'Save access'}
            </Button>
          </section>
        )}
      </div>
    </AppShell>
  );
}
