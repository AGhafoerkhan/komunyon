'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { CoHostPanel } from '@/components/CoHostPanel';
import { InvitePeople } from '@/components/InvitePeople';
import { MemberList } from '@/components/MemberList';
import { PhotoLightbox } from '@/components/PhotoLightbox';
import { useAuth } from '@/components/AuthProvider';
import { clearStudyLink, rememberStudyLink } from '@/components/RouteGuard';
import { AppShell } from '@/components/TopBar';
import { Alert, Avatar, Button, FormatBadge, FormError, LoadingScreen, Spinner, TagList, buttonClass } from '@/components/ui';
import { actionError } from '@/lib/errors';
import { loadSessionAttendance, setSessionAttendance as saveSessionAttendance, subscribeSessionAttendance, subscribeSessionAttendanceList } from '@/lib/attendance';
import { normalizePhone } from '@/lib/validate';
import { cancellationNote, formatSchedule, spotsLabel } from '@/lib/format';
import { formatDdMmYyyy, upcomingSession, upcomingSessions } from '@/lib/format';
import { loadProfile } from '@/lib/users';
import {
  acceptInvite,
  approveMember,
  cancelRequest,
  declineInvite,
  declineMember,
  deleteStudy,
  leaveStudy,
  loadJoinRequests,
  loadCoHostIds,
  loadCoHostEditPermission,
  loadPeople,
  removeMember,
  requestToJoin,
  subscribePrivateDetails,
  subscribeRemovalNotices,
  subscribeStudy,
  setSessionCanceled,
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
  const [hostMember, setHostMember] = useState<JoinRequest | null>(null);
  const [coHostIds, setCoHostIds] = useState<string[]>([]);
  const [canEditStudy, setCanEditStudy] = useState(false);
  const [rosterReady, setRosterReady] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [leftBySelf, setLeftBySelf] = useState(false);
  const [heardRemoval, setHeardRemoval] = useState(false);
  const [removalsChecked, setRemovalsChecked] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [hostPhone, setHostPhone] = useState<string | null>(null);
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

  const approvedMember = Boolean(user && study && study.hostId !== user.uid && study.approvedUserIds.includes(user.uid));

  useEffect(() => {
    if (!approvedMember || !study) {
      setHostPhone(null);
      return;
    }
    let active = true;
    void loadProfile(study.hostId)
      .then((profile) => {
        if (active) setHostPhone(profile?.phone.trim() ?? '');
      })
      .catch(() => {
        if (active) setHostPhone('');
      });
    return () => {
      active = false;
    };
  }, [approvedMember, study]);

  useEffect(() => {
    if (!study || !user) {
      setPendingRequests([]);
      setApprovedMembers([]);
      setRosterReady(false);
      return;
    }
    const host = study.hostId === user.uid;
    const approved = study.approvedUserIds.includes(user.uid);
    if (!host && !approved) {
      setPendingRequests([]);
      setApprovedMembers([]);
      setRosterReady(false);
      return;
    }
    let active = true;
    const task = host
      ? loadJoinRequests(study)
      : loadPeople(study.id, study.approvedUserIds).then((people) => ({ pending: [], approved: people }));
    void task
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

  useEffect(() => {
    if (!study || !user || study.hostId === user.uid) {
      setCanEditStudy(study?.hostId === user?.uid);
      return;
    }
    void loadCoHostEditPermission(study.id, user.uid).then(setCanEditStudy).catch(() => setCanEditStudy(false));
  }, [study, user]);

  useEffect(() => {
    let active = true;
    if (!study) {
      setHostMember(null);
      return;
    }
    void loadProfile(study.hostId)
      .then((profile) => {
        if (!active || !profile) return;
        setHostMember({
          id: `host_${profile.uid}`,
          studyId: study.id,
          userId: profile.uid,
          fullName: profile.fullName,
          age: profile.age,
          photoURL: profile.photoURL,
          bio: profile.bio,
          phone: profile.phone,
          place: [profile.neighbourhood, profile.city, profile.country].filter(Boolean).join(', '),
          status: 'approved',
          profileMissing: false,
        });
      })
      .catch(() => setHostMember(null));
    return () => {
      active = false;
    };
  }, [study?.hostId, study?.id]);

  useEffect(() => {
    if (!study || !user || (study.hostId !== user.uid && !study.approvedUserIds.includes(user.uid))) {
      setCoHostIds([]);
      return;
    }
    void loadCoHostIds(study.id).then(setCoHostIds).catch(() => setCoHostIds([]));
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
  const showLeft = leftBySelf;
  const showRemoved = !showLeft && (removed || (heardRemoval && !memberNow));

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
      ) : showLeft ? (
        <div id="left" className="mt-6 max-w-xl scroll-mt-24">
          <p className="font-serif text-3xl">You left this event.</p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            {study ? `${study.title} is no longer yours to open. ` : null}
            You no longer have the address.
          </p>
        </div>
      ) : showRemoved ? (
        <div id="removed" className="mt-6 max-w-xl scroll-mt-24">
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
          viewerId={user.uid}
          coHostIds={coHostIds}
          hostMember={hostMember}
          canEditStudy={canEditStudy}
          role={roleFor(study, user.uid)}
          details={details}
          detailsState={detailsState}
          error={confirm ? null : error}
          busy={busy}
          pendingRequests={pendingRequests}
          approvedMembers={approvedMembers}
          rosterReady={rosterReady}
          hostPhone={hostPhone}
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
              void run('leave', async () => {
                await leaveStudy(study.id, user.uid);
                setLeftBySelf(true);
              });
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
  const [photo, setPhoto] = useState<{ src: string; name: string } | null>(null);

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
              <Avatar
                src={study.hostPhotoURL}
                name={study.hostName}
                size={40}
                onOpen={() => setPhoto({ src: study.hostPhotoURL, name: study.hostName })}
              />
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
          {cancellationNote(study) ? <p className="text-sm leading-relaxed text-clay">{cancellationNote(study)}</p> : null}
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
      {photo ? <PhotoLightbox src={photo.src} name={photo.name} onClose={() => setPhoto(null)} /> : null}
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

function mapsHref(address: string): string {
  const line = address.trim().replace(/\s+/g, ' ');
  const lower = line.toLowerCase();
  const place = lower.includes('hague') || lower.includes('den haag') ? line : `${line}, The Hague, Netherlands`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(place)}`;
}

function HostPhone({ phone }: { phone: string | null }) {
  if (phone === null) return <p className="text-sm text-muted">Loading the host’s number…</p>;
  const dial = phone ? normalizePhone(phone) : null;
  if (!dial) return <p className="text-sm text-muted">The host has no phone number saved.</p>;
  return (
    <span className="flex flex-wrap items-center gap-x-2 text-sm">
      <a href={`tel:${dial}`} className="text-ink underline decoration-1 underline-offset-2 hover:text-canal">
        Call {phone}
      </a>
      <a href={`https://wa.me/${dial.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="text-ink underline decoration-1 underline-offset-2 hover:text-canal">
        WhatsApp
      </a>
    </span>
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
  viewerId,
  coHostIds,
  hostMember,
  canEditStudy,
  role,
  details,
  detailsState,
  error,
  busy,
  pendingRequests,
  approvedMembers,
  rosterReady,
  hostPhone,
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
  viewerId: string;
  coHostIds: string[];
  hostMember: JoinRequest | null;
  canEditStudy: boolean;
  role: Role;
  details: PrivateStudyDetails | null;
  detailsState: 'hidden' | 'loading' | 'ready';
  error: string | null;
  busy: string | null;
  pendingRequests: JoinRequest[];
  approvedMembers: JoinRequest[];
  rosterReady: boolean;
  hostPhone: string | null;
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
  const [photo, setPhoto] = useState<{ src: string; name: string } | null>(null);
  const sessionDate = upcomingSession(study);
  const scheduledDate = study.format === 'recurring' && study.dayOfWeek !== null
    ? upcomingSessions(study.dayOfWeek, study.time, 1)[0] ?? null
    : study.date;
  const sessionCanceled = Boolean(scheduledDate && study.skippedDates.includes(scheduledDate));
  const [sessionJoined, setSessionJoined] = useState(false);
  const [sessionTaken, setSessionTaken] = useState(0);
  const [showAttending, setShowAttending] = useState(false);
  const [attendingMembers, setAttendingMembers] = useState<JoinRequest[]>([]);
  const [planningOpen, setPlanningOpen] = useState(false);
  const [plannedSessions, setPlannedSessions] = useState<Record<string, boolean>>({});
  const [sessionCounts, setSessionCounts] = useState<Record<string, number>>({});
  const [planningBusy, setPlanningBusy] = useState<string | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [attendanceBusy, setAttendanceBusy] = useState(false);
  const openPhoto = (src: string, name: string) => setPhoto({ src, name });

  useEffect(() => {
    if (!sessionDate || (role !== 'approved' && role !== 'host')) return;
    const unsubscribe = subscribeSessionAttendance(study.id, sessionDate, viewerId, setSessionJoined, () => undefined);
    const unsubscribeList = subscribeSessionAttendanceList(
      study.id,
      sessionDate,
      (records) => setSessionTaken(records.filter((record) => record.joined).length),
      () => setSessionTaken(0),
    );
    return () => {
      unsubscribe();
      unsubscribeList();
    };
  }, [role, sessionDate, study, viewerId]);

  const futureDates = study.format === 'recurring' && study.dayOfWeek !== null
    ? upcomingSessions(study.dayOfWeek, study.time, 8).filter((date) => role === 'host' || !study.skippedDates.includes(date))
    : [];

  useEffect(() => {
    if ((role !== 'approved' && role !== 'host') || futureDates.length === 0) return;
    const unsubscribes = futureDates.map((date) => subscribeSessionAttendanceList(study.id, date, (records) => {
      setPlannedSessions((current) => ({ ...current, [date]: records.some((record) => record.uid === viewerId && record.joined) }));
      setSessionCounts((current) => ({ ...current, [date]: records.filter((record) => record.joined).length }));
    }, () => undefined));
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [futureDates.join(','), role, study.id, viewerId]);

  async function togglePlannedSession(date: string) {
    if (role !== 'approved' || planningBusy) return;
    setPlanningBusy(date);
    const next = !(plannedSessions[date] ?? false);
    if (next && (sessionCounts[date] ?? 0) >= study.maxCapacity) return;
    try {
      await saveSessionAttendance(study.id, date, viewerId, next, study.maxCapacity);
      setPlannedSessions((current) => ({ ...current, [date]: next }));
    } finally {
      setPlanningBusy(null);
    }
  }

  async function toggleHostPlannedSession(date: string) {
    if (role !== 'host' || planningBusy) return;
    setPlanningBusy(date);
    try {
      await setSessionCanceled(study.id, date, !study.skippedDates.includes(date));
    } finally {
      setPlanningBusy(null);
    }
  }

  async function toggleCurrentSession() {
    if (role !== 'host' || !scheduledDate || cancelBusy) return;
    setCancelBusy(true);
    try {
      await setSessionCanceled(study.id, scheduledDate, !sessionCanceled);
    } finally {
      setCancelBusy(false);
    }
  }

  async function toggleAttendance() {
    if (!sessionDate || role !== 'approved' || attendanceBusy) return;
    setAttendanceBusy(true);
    const next = !sessionJoined;
    if (next && sessionTaken >= study.maxCapacity) return;
    try {
      // The current viewer's uid is supplied by the parent through the role-specific action below.
      await saveSessionAttendance(study.id, sessionDate, viewerId, next, study.maxCapacity);
      setSessionJoined(next);
      const records = await loadSessionAttendance(study.id, sessionDate);
      setSessionTaken(records.filter((record) => record.joined).length);
    } finally {
      setAttendanceBusy(false);
    }
  }

  async function toggleAttending(date = sessionDate) {
    if (!date || (role !== 'approved' && role !== 'host')) return;
    const next = !showAttending;
    setShowAttending(next);
    if (!next) return;
    const records = await loadSessionAttendance(study.id, date);
    const ids = records.filter((record) => record.joined).map((record) => record.uid);
    setAttendingMembers(await loadPeople(study.id, ids));
  }

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
            <Avatar
              src={study.hostPhotoURL}
              name={study.hostName}
              size={44}
              onOpen={() => openPhoto(study.hostPhotoURL, study.hostName)}
            />
            <div>
              <p className="text-sm font-medium">
                {study.hostName}
                <span className="font-normal text-muted"> · {study.hostAge}</span>
              </p>
              <div className="flex items-center gap-2">
                <p className="text-xs text-muted">{role === 'host' ? 'You are hosting' : 'Host'}</p>
                {role === 'host' ? (
                  <button
                    type="button"
                    className="text-xs text-muted underline decoration-1 underline-offset-2 hover:text-ink"
                    onClick={() => document.getElementById('co-host')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  >
                    + Co-host
                  </button>
                ) : null}
              </div>
            </div>
          </div>
          <p className="mt-5 max-w-2xl text-sm leading-relaxed break-words whitespace-pre-wrap">{study.description}</p>
          <dl className="mt-6 grid max-w-lg grid-cols-1 gap-4 text-sm min-[28rem]:grid-cols-3">
            <div>
              <dt className="text-muted">When</dt>
              <dd className="mt-1 font-medium">{formatSchedule(study)}</dd>
              {cancellationNote(study) ? (
                <dd className="mt-1 text-sm font-normal leading-relaxed text-clay">{cancellationNote(study)}</dd>
              ) : null}
            </div>
            <div>
              <dt className="text-muted">
                <span className="inline-flex items-center gap-1">
                  Spots
                  {sessionDate && (role === 'approved' || role === 'host') ? (
                    <button
                      type="button"
                      aria-label={showAttending ? 'Hide people attending' : 'See people attending'}
                      title={showAttending ? 'Hide people attending' : 'See people attending'}
                      onClick={() => void toggleAttending()}
                      className="text-xs leading-none text-muted hover:text-ink"
                    >
                      ⓘ
                    </button>
                  ) : null}
                </span>
              </dt>
              <dd className="mt-1 font-medium tabular-nums">
                {sessionDate ? sessionTaken : taken} / {study.maxCapacity}
                <span className="font-normal text-muted"> · {spotsLabel(sessionDate ? sessionTaken : taken, study.maxCapacity)}</span>
              </dd>
            </div>
            <div>
              <dt className="text-muted">Attendance</dt>
              <dd className="mt-1 font-medium tabular-nums">
                {role === 'approved' && sessionDate ? (
                  <button
                    type="button"
                    className={sessionJoined ? 'text-clay underline decoration-black decoration-dashed underline-offset-2 disabled:opacity-50' : 'text-canal underline decoration-1 underline-offset-2 disabled:opacity-50'}
                    onClick={() => void toggleAttendance()}
                    disabled={attendanceBusy || (!sessionJoined && sessionTaken >= study.maxCapacity)}
                  >
                    {sessionJoined ? 'Cancel' : sessionTaken >= study.maxCapacity ? 'Full' : 'Join'}
                  </button>
                ) : role === 'host' && scheduledDate ? (
                  <span className="inline-flex items-center gap-2">
                    <button
                      type="button"
                      className={sessionCanceled ? 'text-canal underline decoration-1 underline-offset-2 hover:text-ink disabled:opacity-50' : 'text-clay underline decoration-black decoration-dashed underline-offset-2 hover:text-ink disabled:opacity-50'}
                      onClick={() => void toggleCurrentSession()}
                      disabled={cancelBusy}
                    >
                      {sessionCanceled ? 'Proceed' : 'Cancel'}
                    </button>
                  </span>
                ) : '—'}
              </dd>
            </div>
          </dl>
          {sessionDate && (role === 'approved' || role === 'host') && showAttending ? (
            <div className="mt-3 max-w-lg">
              <MemberList
                title="Attending this session"
                description={role === 'approved' ? 'The host will attend.' : undefined}
                empty="No one has joined this session yet."
                    requests={hostMember ? [hostMember, ...attendingMembers] : attendingMembers}
                showPhone
                    coHostIds={coHostIds}
              />
            </div>
          ) : null}
          {study.format === 'recurring' && (role === 'approved' || role === 'host') ? (
            <div className="mt-4 max-w-lg">
              <button
                type="button"
                className="text-sm text-muted underline decoration-1 underline-offset-2 hover:text-ink"
                onClick={() => setPlanningOpen((open) => !open)}
                aria-expanded={planningOpen}
              >
                {planningOpen ? 'Hide future sessions' : 'Plan future sessions'}
              </button>
              {planningOpen ? (
                <ul className="mt-3 divide-y divide-line border-y border-line text-sm">
                  {futureDates.map((date) => (
                    <li key={date} className="grid grid-cols-3 items-center gap-3 py-2">
                      <span className="min-w-0">{formatDdMmYyyy(date)} · {study.time}</span>
                      <span className="w-full text-left text-muted tabular-nums">
                        {sessionCounts[date] ?? 0} / {study.maxCapacity} · {spotsLabel(sessionCounts[date] ?? 0, study.maxCapacity)}
                        <button
                          type="button"
                          aria-label={`See people attending ${formatDdMmYyyy(date)}`}
                          title="See people attending"
                          onClick={() => void toggleAttending(date)}
                          className="ml-2 text-xs leading-none hover:text-ink"
                        >
                          ⓘ
                        </button>
                      </span>
                      {role === 'host' ? (
                        <button
                          type="button"
                          className={`w-full text-left underline underline-offset-2 disabled:opacity-50 ${study.skippedDates.includes(date) ? 'text-canal decoration-1' : 'text-clay decoration-black decoration-dashed'}`}
                          onClick={() => void toggleHostPlannedSession(date)}
                          disabled={planningBusy !== null}
                        >
                          {study.skippedDates.includes(date) ? 'Proceed' : 'Cancel'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={`w-full text-left underline underline-offset-2 disabled:opacity-50 ${plannedSessions[date] ? 'text-clay decoration-black decoration-dashed' : 'text-canal decoration-1'}`}
                          onClick={() => void togglePlannedSession(date)}
                          disabled={planningBusy !== null || (!plannedSessions[date] && (sessionCounts[date] ?? 0) >= study.maxCapacity)}
                        >
                          {plannedSessions[date] ? 'Cancel' : sessionCounts[date] >= study.maxCapacity ? 'Full' : 'Join'}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </article>

        <aside className="flex flex-col gap-3 lg:sticky lg:top-20">
          {role === 'host' || role === 'approved' ? (
            <div className="rounded-lg border border-line bg-card p-4">
              <h2 className="text-sm font-medium">Exact address</h2>
              {detailsState === 'loading' ? <p className="mt-2 text-sm text-muted">Loading the address…</p> : null}
              {detailsState === 'ready' && details ? (
                <>
                  <a
                    href={mapsHref(details.exactAddress)}
                    className="mt-2 block text-sm break-words whitespace-pre-wrap text-ink underline decoration-1 underline-offset-2 hover:text-canal"
                  >
                    {details.exactAddress}
                  </a>
                  <h3 className="mt-4 text-sm font-medium">Entry notes</h3>
                  <p className="mt-2 text-sm whitespace-pre-wrap text-muted">
                    {details.entryNotes.trim() || 'No entry notes.'}
                  </p>
                </>
              ) : null}
              {detailsState === 'ready' && !details ? (
                <p className="mt-2 text-sm text-muted">No private details saved yet.</p>
              ) : null}
              {role === 'approved' ? (
                <div className="mt-4">
                  <h3 className="text-sm font-medium">Host phone</h3>
                  <div className="mt-2">
                    <HostPhone phone={hostPhone} />
                  </div>
                </div>
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

          {role === 'host' || role === 'approved' ? (
            <Link href={`/studies/${study.id}/history`} className={`${buttonClass('secondary')} w-full`}>
              History
            </Link>
          ) : null}

          {role === 'invited' ? (
            <div id="accept" className="flex scroll-mt-24 flex-col gap-2">
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

          {role === 'host' || canEditStudy ? (
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

      {role === 'approved' ? (
        <div className="mt-8">
          {!rosterReady ? <p className="mb-4 text-sm text-muted">Loading the group…</p> : null}
          <MemberList
            title="People in this study"
            description="Everyone approved to share this gathering. Open a photo to see it full size."
            empty="No one else is approved yet."
            requests={hostMember ? [hostMember, ...approvedMembers] : approvedMembers}
            showPhone={false}
            coHostIds={coHostIds}
            onPhoto={openPhoto}
          />
        </div>
      ) : null}

      {role === 'host' ? (
        <div className="mt-8 grid gap-4">
          <InvitePeople study={study} />
          <CoHostPanel study={study} />
          {!rosterReady ? <p className="text-sm text-muted">Loading requests…</p> : null}
          {full ? (
            <p className="text-sm text-muted">
              The group is full. Remove someone, or raise the capacity, before approving another person.
            </p>
          ) : null}
          <MemberList
            title="Pending requests"
            description="Photo, name, age, and bio. Approving shares the address."
            empty="No pending requests."
            requests={pendingRequests}
            rowId={(request) => `request-${request.userId}`}
            onPhoto={openPhoto}
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
            rowId={(request) => `member-${request.userId}`}
            onPhoto={openPhoto}
            renderActions={(request) => (
              <Button size="sm" variant="secondary" onClick={() => onAskRemove(request)} disabled={busy !== null}>
                Remove from group
              </Button>
            )}
          />
        </div>
      ) : null}
      {photo ? <PhotoLightbox src={photo.src} name={photo.name} onClose={() => setPhoto(null)} /> : null}
    </div>
  );
}

function isPermissionDenied(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'permission-denied';
}
