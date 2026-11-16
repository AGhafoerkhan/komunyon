'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { InvitePeople } from '@/components/InvitePeople';
import { MemberList } from '@/components/MemberList';
import { useAuth } from '@/components/AuthProvider';
import { clearStudyLink, rememberStudyLink } from '@/components/RouteGuard';
import { AppShell } from '@/components/TopBar';
import { Alert, Avatar, Button, FormatBadge, FormError, LoadingScreen, Spinner, TagList, buttonClass } from '@/components/ui';
import { actionError } from '@/lib/errors';
import { formatSchedule, spotsLabel } from '@/lib/format';
import {
  acceptInvite,
  approveMember,
  cancelRequest,
  declineInvite,
  declineMember,
  deleteStudy,
  leaveStudy,
  loadJoinRequests,
  removeMember,
  requestToJoin,
  subscribePrivateDetails,
  subscribeRemovalNotices,
  subscribeStudy,
} from '@/lib/studies';
import type { BibleStudy, JoinRequest, PrivateStudyDetails } from '@/types';

type Role = 'host' | 'approved' | 'invited' | 'pending' | 'visitor';

type ConfirmAction =
  | { kind: 'leave' }
  | { kind: 'delete' }
  | { kind: 'remove'; userId: string; name: string };

function roleFor(study: BibleStudy, uid: string): Role {
  if (study.hostId === uid) return 'host';
  if (study.approvedUserIds.includes(uid)) return 'approved';
  if (study.invitedUserIds.includes(uid)) return 'invited';
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
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const [pendingRequests, setPendingRequests] = useState<JoinRequest[]>([]);
  const [approvedMembers, setApprovedMembers] = useState<JoinRequest[]>([]);
  const [rosterReady, setRosterReady] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [heardRemoval, setHeardRemoval] = useState(false);
  const [removalsChecked, setRemovalsChecked] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const seenAsMember = useRef(false);

  useEffect(() => {
    if (!studyId) return;
    return subscribeStudy(
      studyId,
      (next) => {
        const uid = user?.uid;
        if (next && uid && next.hostId !== uid && next.approvedUserIds.includes(uid)) {
          seenAsMember.current = true;
        } else if (next && uid && seenAsMember.current && !next.approvedUserIds.includes(uid)) {
          setRemoved(true);
          setError(null);
        }
        setStudy(next);
        setLoaded(true);
      },
      (failure) => {
        if (isPermissionDenied(failure) && seenAsMember.current) {
          setRemoved(true);
          setError(null);
          setLoaded(true);
          return;
        }
        if (isPermissionDenied(failure)) {
          setBlocked(true);
          setError(null);
          setLoaded(true);
          return;
        }
        setError(actionError(failure));
        setLoaded(true);
      },
    );
  }, [studyId, user?.uid]);

  useEffect(() => {
    if (!user || !studyId) return;
    return subscribeRemovalNotices(
      user.uid,
      (notices) => {
        if (notices.some((notice) => notice.studyId === studyId)) setHeardRemoval(true);
        setRemovalsChecked(true);
      },
      () => setRemovalsChecked(true),
    );
  }, [studyId, user]);

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

  const closeConfirm = useCallback(() => {
    if (busy) return;
    setConfirm(null);
    setError(null);
  }, [busy]);

  function ask(next: ConfirmAction) {
    setError(null);
    setConfirm(next);
  }

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await action();
      setConfirm(null);
    } catch (failure) {
      if (isPermissionDenied(failure) && seenAsMember.current) {
        setRemoved(true);
        setConfirm(null);
        setError(null);
        return;
      }
      setError(actionError(failure));
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    if (!studyId) return;
    if (!user) {
      rememberStudyLink(studyId);
      return;
    }
    clearStudyLink(studyId);
  }, [studyId, user]);

  const dialog = study && confirm ? dialogCopy(confirm, study.title) : null;

  if (!user) {
    return <GuestStudy study={study} loaded={loaded} blocked={blocked} missing={!loaded ? false : !study && !blocked} />;
  }

  const memberNow = Boolean(study?.approvedUserIds.includes(user.uid));
  const showRemoved = removed || (heardRemoval && !memberNow);

  return (
    <AppShell>
      <Link href="/dashboard" className="inline-flex text-sm text-muted hover:text-ink">
        ← All studies
      </Link>

      {!loaded || (blocked && !study && !removalsChecked && !removed) ? (
        <p className="mt-6 text-sm text-muted">Loading study…</p>
      ) : !study && !blocked ? (
        <div className="mt-6">
          <p className="font-serif text-3xl">This study is no longer listed.</p>
        </div>
      ) : showRemoved ? (
        <div className="mt-6 max-w-xl">
          <p className="font-serif text-3xl">The host removed you from this study.</p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            {study ? `${study.title} is no longer yours to open. ` : null}
            You no longer have the address.
          </p>
        </div>
      ) : blocked ? (
        <div className="mt-6 max-w-xl">
          <p className="font-serif text-3xl">This study is private.</p>
          <p className="mt-3 text-sm leading-relaxed text-muted">Ask the host for an invite. The address stays hidden until then.</p>
        </div>
      ) : study ? (
        <StudyBody
          study={study}
          role={roleFor(study, user.uid)}
          details={details}
          detailsState={detailsState}
          error={confirm ? null : error}
          busy={busy}
          pendingRequests={pendingRequests}
          approvedMembers={approvedMembers}
          rosterReady={rosterReady}
          onAccept={() => void run('accept', () => acceptInvite(study, user.uid))}
          onDeclineInvite={() =>
            void run('decline-invite', async () => {
              await declineInvite(study.id, user.uid);
              router.push('/invites');
            })
          }
          onRequest={() => void run('join', () => requestToJoin(study.id, user.uid))}
          onCancel={() => void run('cancel', () => cancelRequest(study.id, user.uid))}
          onAskLeave={() => ask({ kind: 'leave' })}
          onAskDelete={() => ask({ kind: 'delete' })}
          onApprove={(request) => void run(`approve:${request.userId}`, () => approveMember(study, request.userId))}
          onDecline={(request) => void run(`decline:${request.userId}`, () => declineMember(study.id, request.userId))}
          onAskRemove={(request) => ask({ kind: 'remove', userId: request.userId, name: request.fullName })}
        />
      ) : null}
      {dialog && confirm && study ? (
        <ConfirmDialog
          title={dialog.title}
          body={dialog.body}
          confirmLabel={dialog.confirmLabel}
          busy={busy !== null}
          error={error}
          onClose={closeConfirm}
          onConfirm={() => {
            if (confirm.kind === 'leave') {
              void run('leave', () => leaveStudy(study.id, user.uid));
              return;
            }
            if (confirm.kind === 'delete') {
              void run('delete', async () => {
                await deleteStudy(study.id);
                router.push('/dashboard');
              });
              return;
            }
            void run(`remove:${confirm.userId}`, () => removeMember(study, confirm.userId));
          }}
        />
      ) : null}
    </AppShell>
  );
}

function GuestStudy({
  study,
  loaded,
  blocked,
  missing,
}: {
  study: BibleStudy | null;
  loaded: boolean;
  blocked: boolean;
  missing: boolean;
}) {
  const { signInWithGoogle, prepareGoogleSignIn, signInError } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (failure) {
      setError(actionError(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md items-center px-4 py-10">
      {!loaded ? (
        <p className="w-full text-center text-sm text-muted">Loading study…</p>
      ) : study ? (
        <article className="flex w-full flex-col gap-3 rounded-lg border border-line bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar src={study.hostPhotoURL} name={study.hostName} size={40} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {study.hostName}
                  <span className="font-normal text-muted"> · {study.hostAge}</span>
                </p>
                <p className="truncate text-xs text-muted">{study.area}</p>
              </div>
            </div>
            <FormatBadge format={study.format} />
          </div>
          <h1 className="font-serif text-xl leading-snug break-words">{study.title}</h1>
          {study.tags.length > 0 ? <TagList tags={study.tags} /> : null}
          <p className="text-sm break-words text-muted">{formatSchedule(study)}</p>
          <p className="text-sm tabular-nums">
            <span className="font-medium text-ink">
              {study.approvedUserIds.length} / {study.maxCapacity}
            </span>
            <span className="text-muted"> · {spotsLabel(study.approvedUserIds.length, study.maxCapacity)}</span>
          </p>
          {error || signInError ? <FormError>{error || signInError}</FormError> : null}
          <Button className="w-full" onPointerDown={prepareGoogleSignIn} onClick={() => void signIn()} disabled={busy}>
            {busy ? <Spinner /> : null}
            Sign in now to join
          </Button>
        </article>
      ) : (
        <article className="flex w-full flex-col gap-3 rounded-lg border border-line bg-card p-4">
          <h1 className="font-serif text-xl leading-snug">
            {blocked ? 'Sign in to open this study.' : missing ? 'This study is no longer listed.' : 'Sign in to open this study.'}
          </h1>
          {blocked ? (
            <p className="text-sm leading-relaxed text-muted">The host shared a private group. Sign in if they invited you.</p>
          ) : null}
          {error || signInError ? <FormError>{error || signInError}</FormError> : null}
          {blocked ? (
            <Button className="w-full" onPointerDown={prepareGoogleSignIn} onClick={() => void signIn()} disabled={busy}>
              {busy ? <Spinner /> : null}
              Sign in now to join
            </Button>
          ) : null}
        </article>
      )}
    </main>
  );
}

function ShareStudy({ study }: { study: BibleStudy }) {
  const [copied, setCopied] = useState(false);

  async function onShare() {
    const url = `${window.location.origin}/studies/${study.id}`;
    const phone = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (phone && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: study.title,
          text: `${study.title} · ${study.area}`,
          url,
        });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const field = document.createElement('textarea');
      field.value = url;
      field.setAttribute('readonly', '');
      document.body.appendChild(field);
      field.select();
      document.execCommand('copy');
      field.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 4000);
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => void onShare()}
        aria-label="Share study"
        className="inline-flex h-10 w-10 items-center justify-center rounded-md text-ink hover:bg-sand"
      >
        <ShareIcon />
      </button>
      {copied ? (
        <p role="status" className="absolute top-11 right-0 whitespace-nowrap text-xs text-canal">
          Share link copied
        </p>
      ) : null}
    </div>
  );
}

function ShareIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M8 10.5 14.5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8 9.5 14.5 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="5.5" cy="10" r="2.25" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="15" cy="5.25" r="2.25" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="15" cy="14.75" r="2.25" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function dialogCopy(action: ConfirmAction, studyTitle: string): { title: string; body: string; confirmLabel: string } {
  if (action.kind === 'leave') {
    return {
      title: 'Leave this group?',
      body: `You will lose the address for ${studyTitle}, and your spot opens up.`,
      confirmLabel: 'Leave group',
    };
  }
  if (action.kind === 'delete') {
    return {
      title: 'Delete this study?',
      body: `${studyTitle} will be removed for everyone, including the address.`,
      confirmLabel: 'Delete study',
    };
  }
  return {
    title: `Remove ${action.name}?`,
    body: `${action.name} will lose the address for ${studyTitle}, and their spot opens up.`,
    confirmLabel: 'Remove from group',
  };
}

function StudyBody({
  study,
  role,
  details,
  detailsState,
  error,
  busy,
  pendingRequests,
  approvedMembers,
  rosterReady,
  onAccept,
  onDeclineInvite,
  onRequest,
  onCancel,
  onAskLeave,
  onAskDelete,
  onApprove,
  onDecline,
  onAskRemove,
}: {
  study: BibleStudy;
  role: Role;
  details: PrivateStudyDetails | null;
  detailsState: 'hidden' | 'loading' | 'ready';
  error: string | null;
  busy: string | null;
  pendingRequests: JoinRequest[];
  approvedMembers: JoinRequest[];
  rosterReady: boolean;
  onAccept: () => void;
  onDeclineInvite: () => void;
  onRequest: () => void;
  onCancel: () => void;
  onAskLeave: () => void;
  onAskDelete: () => void;
  onApprove: (request: JoinRequest) => void;
  onDecline: (request: JoinRequest) => void;
  onAskRemove: (request: JoinRequest) => void;
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
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <FormatBadge format={study.format} />
              <span className="text-sm text-muted">{study.area}</span>
            </div>
            {study.isPublic || role === 'host' ? <ShareStudy study={study} /> : null}
          </div>
          <h1 className="mt-3 font-serif text-3xl leading-tight break-words sm:text-4xl">{study.title}</h1>
          {study.tags.length > 0 ? (
            <div className="mt-3">
              <TagList tags={study.tags} />
            </div>
          ) : null}
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
          <p className="mt-5 max-w-2xl text-sm leading-relaxed break-words whitespace-pre-wrap">{study.description}</p>
          <dl className="mt-6 grid max-w-lg grid-cols-1 gap-4 text-sm min-[28rem]:grid-cols-2">
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
                  <p className="mt-2 text-sm break-words whitespace-pre-wrap">{details.exactAddress}</p>
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
                {role === 'invited'
                  ? `${study.area}. Accept the invite to unlock the street address.`
                  : `${study.area}. The street address and entry notes unlock after the host approves you.`}
              </p>
            </div>
          )}

          {role === 'invited' ? (
            <div className="flex flex-col gap-2">
              <Button className="w-full" onClick={onAccept} disabled={full || busy !== null}>
                Accept invite
              </Button>
              <Button className="w-full" variant="secondary" onClick={onDeclineInvite} disabled={busy !== null}>
                Decline
              </Button>
              {full ? <p className="text-xs text-muted">This study is full.</p> : null}
            </div>
          ) : null}

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
            <Button className="w-full" variant="secondary" onClick={onAskLeave} disabled={busy !== null}>
              Leave group
            </Button>
          ) : null}

          {role === 'host' ? (
            <div className="flex flex-col gap-2">
              <Link href={`/studies/${study.id}/edit`} className={`${buttonClass('primary')} w-full`}>
                Edit study
              </Link>
              <Button className="w-full" variant="danger" onClick={onAskDelete} disabled={busy !== null}>
                Delete study
              </Button>
            </div>
          ) : null}
        </aside>
      </div>

      {role === 'host' ? (
        <div className="mt-8 grid gap-4">
          <InvitePeople study={study} />
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
            renderActions={(request) => (
              <Button size="sm" variant="secondary" onClick={() => onAskRemove(request)} disabled={busy !== null}>
                Remove from group
              </Button>
            )}
          />
        </div>
      ) : null}
    </div>
  );
}

function isPermissionDenied(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'permission-denied';
}
