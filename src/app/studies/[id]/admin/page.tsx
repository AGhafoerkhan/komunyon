'use client';

import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { AppShell } from '@/components/TopBar';
import { Alert, Button, LoadingScreen, pageTitleClass } from '@/components/ui';
import { actionError } from '@/lib/errors';
import { getFirebase } from '@/lib/firebase';
import { getStudy } from '@/lib/studies';
import { loadProfile } from '@/lib/users';

export default function CoHostAdminPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const studyId = typeof params.id === 'string' ? params.id : '';
  const uid = searchParams.get('uid') ?? '';
  const { user } = useAuth();
  const [name, setName] = useState('Co-host');
  const [canEdit, setCanEdit] = useState(false);
  const [canManageParticipants, setCanManageParticipants] = useState(false);
  const [canManageCoHosts, setCanManageCoHosts] = useState(false);
  const [canManageCoHostPermissions, setCanManageCoHostPermissions] = useState(false);
  const [grantable, setGrantable] = useState({ canEdit: false, canManageParticipants: false, canManageSessions: false, canManageCoHosts: false, canManageCoHostPermissions: false });
  const [grantableAllowed, setGrantableAllowed] = useState({ canEdit: true, canManageParticipants: true, canManageSessions: true, canManageCoHosts: true, canManageCoHostPermissions: true });
  const [isPrimaryHost, setIsPrimaryHost] = useState(false);
  const [canManageSessions, setCanManageSessions] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !studyId || !uid) return;
    let active = true;
    let stopManagers: Array<() => void> = [];
    void Promise.all([
      getStudy(studyId),
      loadProfile(uid),
      getDoc(doc(getFirebase().db, 'studies', studyId, 'managers', uid)),
      getDoc(doc(getFirebase().db, 'studies', studyId, 'managers', user.uid)),
    ])
      .then(([study, profile, manager, actorManager]) => {
        if (!active) return;
        const canManagePermissions = actorManager.exists() && actorManager.data().permissions?.canManageCoHostPermissions === true;
        if (!study || (study.hostId !== user.uid && (!canManagePermissions || uid === user.uid)) || !study.approvedUserIds.includes(uid)) {
          setError('Only the primary host can manage an approved co-host.');
          setLoaded(true);
          return;
        }
        const actorGrantable = actorManager.data()?.permissions?.grantable;
        setIsPrimaryHost(study.hostId === user.uid);
        setGrantableAllowed({
          canEdit: study.hostId === user.uid || actorGrantable?.canEdit === true,
          canManageParticipants: study.hostId === user.uid || actorGrantable?.canManageParticipants === true,
          canManageSessions: study.hostId === user.uid || actorGrantable?.canManageSessions === true,
          canManageCoHosts: study.hostId === user.uid || actorGrantable?.canManageCoHosts === true,
          canManageCoHostPermissions: study.hostId === user.uid || actorGrantable?.canManageCoHostPermissions === true,
        });
        setName(profile?.fullName || 'Assigned co-host');
        setCanEdit(manager.exists() && manager.data().permissions?.canEdit === true);
        setCanManageParticipants(manager.exists() && manager.data().permissions?.canManageParticipants === true);
        setCanManageCoHosts(manager.exists() && manager.data().permissions?.canManageCoHosts === true);
        setCanManageCoHostPermissions(manager.exists() && manager.data().permissions?.canManageCoHostPermissions === true);
        setGrantable({ canEdit: manager.data()?.permissions?.grantable?.canEdit === true, canManageParticipants: manager.data()?.permissions?.grantable?.canManageParticipants === true, canManageSessions: manager.data()?.permissions?.grantable?.canManageSessions === true, canManageCoHosts: manager.data()?.permissions?.grantable?.canManageCoHosts === true, canManageCoHostPermissions: manager.data()?.permissions?.grantable?.canManageCoHostPermissions === true });
        setCanManageSessions(manager.exists() && manager.data().permissions?.canManageSessions === true);
        stopManagers = [
          onSnapshot(doc(getFirebase().db, 'studies', studyId, 'managers', uid), (snapshot) => {
            if (!active) return;
            const permissions = snapshot.data()?.permissions;
            setCanEdit(permissions?.canEdit === true);
            setCanManageParticipants(permissions?.canManageParticipants === true);
            setCanManageCoHosts(permissions?.canManageCoHosts === true);
            setCanManageCoHostPermissions(permissions?.canManageCoHostPermissions === true);
            setCanManageSessions(permissions?.canManageSessions === true);
            setGrantable({
              canEdit: permissions?.grantable?.canEdit === true,
              canManageParticipants: permissions?.grantable?.canManageParticipants === true,
              canManageSessions: permissions?.grantable?.canManageSessions === true,
              canManageCoHosts: permissions?.grantable?.canManageCoHosts === true,
              canManageCoHostPermissions: permissions?.grantable?.canManageCoHostPermissions === true,
            });
          }),
          onSnapshot(doc(getFirebase().db, 'studies', studyId, 'managers', user.uid), (snapshot) => {
            if (!active) return;
            const actorPermissions = snapshot.data()?.permissions;
            setGrantableAllowed({
              canEdit: study.hostId === user.uid || actorPermissions?.grantable?.canEdit === true,
              canManageParticipants: study.hostId === user.uid || actorPermissions?.grantable?.canManageParticipants === true,
              canManageSessions: study.hostId === user.uid || actorPermissions?.grantable?.canManageSessions === true,
              canManageCoHosts: study.hostId === user.uid || actorPermissions?.grantable?.canManageCoHosts === true,
              canManageCoHostPermissions: study.hostId === user.uid || actorPermissions?.grantable?.canManageCoHostPermissions === true,
            });
          }),
        ];
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
      stopManagers.forEach((stop) => stop());
    };
  }, [studyId, uid, user]);

  async function save() {
    if (!user || !studyId || !uid) return;
    setSaving(true);
    setError(null);
    try {
      const study = await getStudy(studyId);
      const actorManager = await getDoc(doc(getFirebase().db, 'studies', studyId, 'managers', user.uid));
      const canManagePermissions = actorManager.exists() && actorManager.data().permissions?.canManageCoHostPermissions === true;
      if (!study || (study.hostId !== user.uid && (!canManagePermissions || uid === user.uid))) throw new Error('You do not have permission to manage co-host access.');
      const actorGrantable = actorManager.data()?.permissions?.grantable;
      const allowed = (permission: keyof typeof grantable) => study.hostId === user.uid || actorGrantable?.[permission] === true;
      const safeGrantable = {
        canEdit: grantable.canEdit && allowed('canEdit'),
        canManageParticipants: grantable.canManageParticipants && allowed('canManageParticipants'),
        canManageSessions: grantable.canManageSessions && allowed('canManageSessions'),
        canManageCoHosts: grantable.canManageCoHosts && allowed('canManageCoHosts'),
        canManageCoHostPermissions: grantable.canManageCoHostPermissions && allowed('canManageCoHostPermissions'),
      };
      await setDoc(doc(getFirebase().db, 'studies', studyId, 'managers', uid), {
        uid,
        permissions: { canEdit, canManageParticipants, canManageCoHosts, canManageCoHostPermissions, canManageSessions, grantable: safeGrantable },
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
        {error ? <div className="mt-5"><Alert>{error}</Alert></div> : !isPrimaryHost && !Object.values(grantableAllowed).some(Boolean) ? (
          <div className="mt-5"><Alert>Ask an admin to grant you permission to manage co-host access.</Alert></div>
        ) : (
          <section className="mt-6 rounded-lg border border-line bg-card p-4">
            <div className="flex items-center justify-between gap-4">
              <span>
                <span className="block font-medium">Can edit this study</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">Allow this co-host to use the Edit study page and manage history files.</span>
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
            <div className="mt-6 flex items-center justify-between gap-4 border-t border-line pt-5">
              <span>
                <span className="block font-medium">Can manage sessions</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">Allow this co-host to proceed or cancel future sessions.</span>
              </span>
              <button type="button" role="switch" aria-checked={canManageSessions} aria-label="Can manage sessions" onClick={() => setCanManageSessions((current) => !current)} className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border p-1 transition-colors duration-200 ${canManageSessions ? 'border-canal bg-canal' : 'border-line bg-sand'}`}>
                <span className={`size-6 rounded-full bg-card shadow-sm transition-transform duration-200 ${canManageSessions ? 'translate-x-6' : 'translate-x-0'}`} />
                <span className={`absolute inset-0 flex items-center text-[10px] font-medium ${canManageSessions ? 'justify-start pl-2 text-white' : 'justify-end pr-2 text-muted'}`}>{canManageSessions ? 'ON' : 'OFF'}</span>
              </button>
            </div>
            <div className="mt-6 flex items-center justify-between gap-4 border-t border-line pt-5">
              <span>
                <span className="block font-medium">Can manage co-hosts</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">Allow this co-host to assign, remove, and manage co-host access.</span>
              </span>
              <button type="button" role="switch" aria-checked={canManageCoHosts} aria-label="Can manage co-hosts" onClick={() => setCanManageCoHosts((current) => !current)} className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border p-1 transition-colors duration-200 ${canManageCoHosts ? 'border-canal bg-canal' : 'border-line bg-sand'}`}>
                <span className={`size-6 rounded-full bg-card shadow-sm transition-transform duration-200 ${canManageCoHosts ? 'translate-x-6' : 'translate-x-0'}`} />
                <span className={`absolute inset-0 flex items-center text-[10px] font-medium ${canManageCoHosts ? 'justify-start pl-2 text-white' : 'justify-end pr-2 text-muted'}`}>{canManageCoHosts ? 'ON' : 'OFF'}</span>
              </button>
            </div>
            <div className="mt-6 flex items-center justify-between gap-4 border-t border-line pt-5">
              <span>
                <span className="block font-medium">Can manage co-host permissions</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">Allow this co-host to change permissions for OTHER co-hosts.</span>
              </span>
              <button type="button" role="switch" aria-checked={canManageCoHostPermissions} aria-label="Can manage co-host permissions" onClick={() => setCanManageCoHostPermissions((current) => !current)} className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border p-1 transition-colors duration-200 ${canManageCoHostPermissions ? 'border-canal bg-canal' : 'border-line bg-sand'}`}>
                <span className={`size-6 rounded-full bg-card shadow-sm transition-transform duration-200 ${canManageCoHostPermissions ? 'translate-x-6' : 'translate-x-0'}`} />
                <span className={`absolute inset-0 flex items-center text-[10px] font-medium ${canManageCoHostPermissions ? 'justify-start pl-2 text-white' : 'justify-end pr-2 text-muted'}`}>{canManageCoHostPermissions ? 'ON' : 'OFF'}</span>
              </button>
            </div>
            {canManageCoHostPermissions ? (
              <div className="mt-4 ml-4 border-l-2 border-canal pl-4">
                <p className="text-sm font-medium">Permissions {name} may grant</p>
                {Object.values(grantableAllowed).some(Boolean) ? (
                  <div className="mt-2 divide-y divide-line">
                    {([
                    ['canEdit', 'Can edit this study'],
                    ['canManageParticipants', 'Can manage participants'],
                    ['canManageSessions', 'Can manage sessions'],
                    ['canManageCoHosts', 'Can manage co-hosts'],
                    ['canManageCoHostPermissions', 'Can manage co-host permissions'],
                    ] as const).filter(([key]) => grantableAllowed[key]).map(([key, label]) => (
                      <label key={key} className="flex items-center justify-between gap-4 py-2 text-sm">
                        <span>{label}</span>
                        <input type="checkbox" checked={grantable[key]} disabled={!grantableAllowed[key] && !grantable[key]} onChange={(event) => setGrantable((current) => ({ ...current, [key]: event.target.checked }))} />
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm leading-relaxed text-muted">Ask an admin to grant you permission to manage co-host access.</p>
                )}
              </div>
            ) : null}
            <Button className="mt-6" onClick={() => void save()} disabled={saving}>
              {saving ? 'Saving…' : 'Save access'}
            </Button>
          </section>
        )}
      </div>
    </AppShell>
  );
}
