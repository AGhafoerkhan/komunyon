'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { MemberList } from '@/components/MemberList';
import { useAuth } from '@/components/AuthProvider';
import { AppShell } from '@/components/TopBar';
import { Alert, Avatar, Button, FormatBadge, LoadingScreen, buttonClass } from '@/components/ui';
import { actionError } from '@/lib/errors';
import { formatSchedule, spotsLabel } from '@/lib/format';
import {
  approveMember,
  cancelRequest,
  declineMember,
  deleteStudy,
  leaveStudy,
  loadJoinRequests,
  removeMember,
  requestToJoin,
  subscribePrivateDetails,
  subscribeStudy,
} from '@/lib/studies';
import type { BibleStudy, JoinRequest, PrivateStudyDetails } from '@/types';

type Role = 'host' | 'approved' | 'pending' | 'visitor';

function roleFor(study: BibleStudy, uid: string): Role {
  if (study.hostId === uid) return 'host';
  if (study.approvedUserIds.includes(uid)) return 'approved';
  if (study.pendingUserIds.includes(uid)) return 'pending';
  return 'visitor';
}

export default function StudyPage() {
  const params = useParams();
  const studyId = typeof params.id === 'string' ? params.id : '';
  const router = useRouter();
  const { user } = useAuth();
  const [study, setStudy] = useState<BibleStudy | null>(null);
  const [details, setDetails] = useState<PrivateStudyDetails | null>(null);
  const [detailsState, setDetailsState] = useState<'hidden' | 'loading' | 'ready'>('hidden');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [pendingRequests, setPendingRequests] = useState<JoinRequest[]>([]);
  const [approvedMembers, setApprovedMembers] = useState<JoinRequest[]>([]);
  const [rosterReady, setRosterReady] = useState(false);

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

  const canReadPrivate = Boolean(
    user && study && (study.hostId === user.uid || study.approvedUserIds.includes(user.uid)),
  );

  useEffect(() => {
    if (!studyId || !canReadPrivate) {
      setDetails(null);
      setDetailsState('hidden');
      return;
    }
    setDetailsState('loading');
    return subscribePrivateDetails(
      studyId,
      (next) => {
        setDetails(next);
        setDetailsState('ready');
      },
      (failure) => {
        setDetails(null);
        setDetailsState('ready');
        if (isPermissionDenied(failure)) return;
        setError(actionError(failure));
      },
    );
  }, [canReadPrivate, studyId]);

  useEffect(() => {
    if (!study || !user || study.hostId !== user.uid) {
      setPendingRequests([]);
      setApprovedMembers([]);
      setRosterReady(false);
      return;
    }
    let active = true;
    void loadJoinRequests(study)
      .then((result) => {
        if (!active) return;
        setPendingRequests(result.pending);
        setApprovedMembers(result.approved);
        setRosterReady(true);
      })
      .catch((failure: unknown) => {
        if (!active) return;
        setError(actionError(failure));
        setRosterReady(true);
      });
    return () => {
      active = false;
    };
  }, [study, user]);

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await action();
    } catch (failure) {
      setError(actionError(failure));
    } finally {
      setBusy(null);
    }
  }

  if (!user) return <LoadingScreen />;

  return (
    <AppShell>
      <Link href="/dashboard" className="text-sm text-muted hover:text-ink">
        ← All studies
      </Link>

      {!loaded ? (
        <p className="mt-6 text-sm text-muted">Loading study…</p>
      ) : !study ? (
        <div className="mt-6">
          {error ? <Alert>{error}</Alert> : <p className="font-serif text-3xl">This study is no longer listed.</p>}
        </div>
      ) : (
        <StudyBody
          study={study}
          role={roleFor(study, user.uid)}
          details={details}
          detailsState={detailsState}
          error={error}
          busy={busy}
          confirmLeave={confirmLeave}
          confirmDelete={confirmDelete}
          confirmRemoveId={confirmRemoveId}
          pendingRequests={pendingRequests}
          approvedMembers={approvedMembers}
          rosterReady={rosterReady}
          onRequest={() => void run('join', () => requestToJoin(study.id, user.uid))}
          onCancel={() => void run('cancel', () => cancelRequest(study.id, user.uid))}
          onLeave={() =>
            void run('leave', async () => {
              await leaveStudy(study.id, user.uid);
              setConfirmLeave(false);
            })
          }
          onDelete={() =>
            void run('delete', async () => {
              await deleteStudy(study.id);
              router.push('/dashboard');
            })
          }
          onApprove={(request) => void run(`approve:${request.userId}`, () => approveMember(study, request.userId))}
          onDecline={(request) => void run(`decline:${request.userId}`, () => declineMember(study.id, request.userId))}
          onRemove={(request) =>
            void run(`remove:${request.userId}`, async () => {
              await removeMember(study.id, request.userId);
              setConfirmRemoveId(null);
            })
          }
          setConfirmLeave={setConfirmLeave}
          setConfirmDelete={setConfirmDelete}
          setConfirmRemoveId={setConfirmRemoveId}
        />
      )}
    </AppShell>
  );
}

function StudyBody({
  study,
  role,
  details,
  detailsState,
  error,
  busy,
  confirmLeave,
  confirmDelete,
  confirmRemoveId,
  pendingRequests,
  approvedMembers,
  rosterReady,
  onRequest,
  onCancel,
  onLeave,
  onDelete,
  onApprove,
  onDecline,
  onRemove,
  setConfirmLeave,
  setConfirmDelete,
  setConfirmRemoveId,
}: {
  study: BibleStudy;
  role: Role;
  details: PrivateStudyDetails | null;
  detailsState: 'hidden' | 'loading' | 'ready';
  error: string | null;
  busy: string | null;
  confirmLeave: boolean;
  confirmDelete: boolean;
  confirmRemoveId: string | null;
  pendingRequests: JoinRequest[];
  approvedMembers: JoinRequest[];
  rosterReady: boolean;
  onRequest: () => void;
  onCancel: () => void;
  onLeave: () => void;
  onDelete: () => void;
  onApprove: (request: JoinRequest) => void;
  onDecline: (request: JoinRequest) => void;
  onRemove: (request: JoinRequest) => void;
  setConfirmLeave: (value: boolean) => void;
  setConfirmDelete: (value: boolean) => void;
  setConfirmRemoveId: (value: string | null) => void;
}) {
  const taken = study.approvedUserIds.length;
  const full = taken >= study.maxCapacity;
  const ratio = study.maxCapacity === 0 ? 0 : Math.min(100, (taken / study.maxCapacity) * 100);

  return (
    <div className="mt-4">
      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <article>
          <div className="flex flex-wrap items-center gap-2">
            <FormatBadge format={study.format} />
            <span className="text-sm text-muted">{study.area}</span>
          </div>
          <h1 className="mt-3 font-serif text-4xl leading-tight">{study.title}</h1>
          <div className="mt-4 flex items-center gap-3">
            <Avatar src={study.hostPhotoURL} name={study.hostName} size={44} />
            <div>
              <p className="text-sm font-medium">
                {study.hostName}
                <span className="font-normal text-muted"> · {study.hostAge}</span>
              </p>
              <p className="text-xs text-muted">{role === 'host' ? 'You are hosting' : 'Host'}</p>
            </div>
          </div>
          <p className="mt-5 max-w-2xl text-sm leading-relaxed whitespace-pre-wrap">{study.description}</p>
          <dl className="mt-6 grid max-w-lg grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-muted">When</dt>
              <dd className="mt-1 font-medium">{formatSchedule(study)}</dd>
            </div>
            <div>
              <dt className="text-muted">Spots</dt>
              <dd className="mt-1 font-medium tabular-nums">
                {taken} / {study.maxCapacity}
                <span className="font-normal text-muted"> · {spotsLabel(taken, study.maxCapacity)}</span>
              </dd>
            </div>
          </dl>
          <div className="mt-3 h-1.5 max-w-lg overflow-hidden rounded-full bg-sand">
            <div className="h-full rounded-full bg-canal" style={{ width: `${ratio}%` }} />
          </div>
        </article>

        <aside className="flex flex-col gap-3 lg:sticky lg:top-20">
          {role === 'host' || role === 'approved' ? (
            <div className="rounded-lg border border-line bg-card p-4">
              <h2 className="text-sm font-medium">Exact address</h2>
              {detailsState === 'loading' ? <p className="mt-2 text-sm text-muted">Loading the address…</p> : null}
              {detailsState === 'ready' && details ? (
                <>
                  <p className="mt-2 text-sm whitespace-pre-wrap">{details.exactAddress}</p>
                  <h3 className="mt-4 text-sm font-medium">Entry notes</h3>
                  <p className="mt-2 text-sm whitespace-pre-wrap text-muted">
                    {details.entryNotes.trim() || 'No entry notes.'}
                  </p>
                </>
              ) : null}
              {detailsState === 'ready' && !details ? (
                <p className="mt-2 text-sm text-muted">No private details saved yet.</p>
              ) : null}
            </div>
          ) : (
            <div className="rounded-lg border border-line bg-card p-4">
              <h2 className="text-sm font-medium">Address</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {study.area}. The street address and entry notes unlock after the host approves you.
              </p>
            </div>
          )}

          {role === 'visitor' ? (
            <div className="flex flex-col gap-2">
              <Button className="w-full" onClick={onRequest} disabled={full || busy !== null}>
                Request to join
              </Button>
              {full ? <p className="text-xs text-muted">This study is full.</p> : null}
            </div>
          ) : null}

          {role === 'pending' ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted">The host has your request.</p>
              <Button className="w-full" variant="secondary" onClick={onCancel} disabled={busy !== null}>
                Cancel request
              </Button>
            </div>
          ) : null}

          {role === 'approved' ? (
            confirmLeave ? (
              <div className="flex flex-col gap-2 rounded-lg border border-line bg-card p-3">
                <p className="text-sm">Leave this group? You will lose the address.</p>
                <div className="flex gap-2">
                  <Button variant="danger" size="sm" onClick={onLeave} disabled={busy !== null}>
                    Leave group
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmLeave(false)} disabled={busy !== null}>
                    Stay
                  </Button>
                </div>
              </div>
            ) : (
              <Button className="w-full" variant="secondary" onClick={() => setConfirmLeave(true)} disabled={busy !== null}>
                Leave group
              </Button>
            )
          ) : null}

          {role === 'host' ? (
            <div className="flex flex-col gap-2">
              <Link href={`/studies/${study.id}/edit`} className={`${buttonClass('primary')} w-full`}>
                Edit study
              </Link>
              {confirmDelete ? (
                <div className="rounded-lg border border-danger/30 bg-card p-3">
                  <p className="text-sm">Delete this study for everyone?</p>
                  <div className="mt-3 flex gap-2">
                    <Button variant="danger" size="sm" onClick={onDelete} disabled={busy !== null}>
                      Delete study
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)} disabled={busy !== null}>
                      Keep
                    </Button>
                  </div>
                </div>
              ) : (
                <Button className="w-full" variant="danger" onClick={() => setConfirmDelete(true)} disabled={busy !== null}>
                  Delete study
                </Button>
              )}
            </div>
          ) : null}
        </aside>
      </div>

      {role === 'host' ? (
        <div className="mt-8 grid gap-4">
          {!rosterReady ? <p className="text-sm text-muted">Loading requests…</p> : null}
          {full ? (
            <p className="text-sm text-muted">
              The group is full. Remove someone, or raise the capacity, before approving another person.
            </p>
          ) : null}
          <MemberList
            title="Pending requests"
            description="Photo, name, age, and bio. Approving shares the address and takes a spot."
            empty="No pending requests."
            requests={pendingRequests}
            renderActions={(request) => (
              <>
                <Button size="sm" onClick={() => onApprove(request)} disabled={full || busy !== null}>
                  Approve
                </Button>
                <Button size="sm" variant="secondary" onClick={() => onDecline(request)} disabled={busy !== null}>
                  Decline
                </Button>
              </>
            )}
          />
          <MemberList
            title="Approved group members"
            description="Removing someone hides the address from them and frees a spot."
            empty="No approved members yet."
            requests={approvedMembers}
            renderActions={(request) =>
              confirmRemoveId === request.userId ? (
                <>
                  <Button size="sm" variant="danger" onClick={() => onRemove(request)} disabled={busy !== null}>
                    Remove from group
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmRemoveId(null)} disabled={busy !== null}>
                    Keep
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => setConfirmRemoveId(request.userId)} disabled={busy !== null}>
                  Remove from group
                </Button>
              )
            }
          />
        </div>
      ) : null}
    </div>
  );
}

function isPermissionDenied(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'permission-denied';
}
