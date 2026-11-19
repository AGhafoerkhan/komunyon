'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Avatar, FormatBadge, TagList } from '@/components/ui';
import { loadSessionAttendance, setSessionAttendance, subscribeSessionAttendance, subscribeSessionAttendanceList } from '@/lib/attendance';
import { cancellationNote, formatDdMmYyyy, formatSchedule, isPastStudy, spotsLabel, upcomingSession, upcomingSessions } from '@/lib/format';
import { requestToJoin } from '@/lib/studies';
import type { BibleStudy } from '@/types';

function cardHostName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? fullName;
  return `${parts[0][0]?.toUpperCase() ?? ''} ${parts[parts.length - 1]}`;
}

export function StudyCard({ study, viewerId }: { study: BibleStudy; viewerId: string }) {
  const taken = study.approvedUserIds.length;
  const hosting = study.hostId === viewerId;
  const joined = !hosting && study.approvedUserIds.includes(viewerId);
  const pending = !hosting && study.pendingUserIds.includes(viewerId);
  const sessionDate = upcomingSession(study);
  const past = isPastStudy(study);
  const firstScheduledDate = study.format === 'recurring' && study.dayOfWeek !== null
    ? upcomingSessions(study.dayOfWeek, study.time, 1)[0] ?? null
    : study.date;
  const canceledDate = firstScheduledDate && study.skippedDates.includes(firstScheduledDate) ? firstScheduledDate : null;
  const displayedHostName = cardHostName(study.hostName);
  const [sessionTaken, setSessionTaken] = useState(taken);
  const [sessionJoined, setSessionJoined] = useState(false);
  const [attendanceBusy, setAttendanceBusy] = useState(false);
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinRequested, setJoinRequested] = useState(pending);

  useEffect(() => {
    if (!sessionDate || (!hosting && !joined)) {
      setSessionTaken(taken);
      return;
    }
    let active = true;
    void loadSessionAttendance(study.id, sessionDate)
      .then((records) => {
        if (active) setSessionTaken(records.filter((record) => record.joined).length);
      })
      .catch(() => {
        if (active) setSessionTaken(taken);
      });
    return () => {
      active = false;
    };
  }, [hosting, joined, sessionDate, study.id, taken]);

  useEffect(() => {
    if (!sessionDate || !joined) return;
    const unsubscribeUser = subscribeSessionAttendance(study.id, sessionDate, viewerId, setSessionJoined, () => undefined);
    const unsubscribeList = subscribeSessionAttendanceList(
      study.id,
      sessionDate,
      (records) => setSessionTaken(records.filter((record) => record.joined).length),
      () => undefined,
    );
    return () => {
      unsubscribeUser();
      unsubscribeList();
    };
  }, [joined, sessionDate, study.id, viewerId]);

  async function toggleCardAttendance(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!sessionDate || !joined || attendanceBusy) return;
    const next = !sessionJoined;
    if (next && sessionTaken >= study.maxCapacity) return;
    setAttendanceBusy(true);
    try {
      await setSessionAttendance(study.id, sessionDate, viewerId, next, study.maxCapacity);
      setSessionJoined(next);
    } finally {
      setAttendanceBusy(false);
    }
  }

  async function requestCardJoin(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (hosting || joined || joinRequested || joinBusy) return;
    setJoinBusy(true);
    try {
      await requestToJoin(study.id, viewerId);
      setJoinRequested(true);
    } finally {
      setJoinBusy(false);
    }
  }

  return (
    <div
      className="relative flex h-[320px] w-full flex-col gap-3 overflow-hidden rounded-lg border border-line bg-card p-4 transition hover:border-canal/40"
    >
      <Link href={`/studies/${study.id}`} className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex h-10 shrink-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar src={study.hostPhotoURL} name={study.hostName} size={40} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {displayedHostName}
              <span className="font-normal text-muted"> · {study.hostAge}</span>
            </p>
            <p className="truncate text-xs text-muted">{study.area}</p>
          </div>
        </div>
        <FormatBadge format={study.format} />
      </div>
      <div className="h-[6.5rem] shrink-0 overflow-hidden md:h-[7.5rem]">
        <h2 className="h-12 overflow-hidden font-serif text-xl leading-7 break-words md:h-14">{study.title}</h2>
        <div className="mt-0 flex h-6 items-start overflow-hidden md:mt-3">
          <TagList tags={study.tags} />
        </div>
        <div className="mt-1 text-sm text-muted">
          {canceledDate ? (
            <p>{formatDdMmYyyy(canceledDate)} · {study.time} · <span className="text-clay">Canceled</span></p>
          ) : (
            <p>{formatSchedule(study)}</p>
          )}
        </div>
      </div>
      <p className={`h-10 shrink-0 overflow-hidden text-sm leading-relaxed line-clamp-2 ${canceledDate ? 'text-canal' : 'text-clay'}`}>
        {past ? 'This study has ended.' : canceledDate ? `Next session: ${formatSchedule(study)}` : cancellationNote(study) || '\u00a0'}
      </p>
          <p className="mt-auto shrink-0 pr-20 text-sm tabular-nums">
        <span className="font-medium text-ink">
          {sessionDate ? sessionTaken : past ? 'Past' : taken} {past ? '' : `/ ${study.maxCapacity}`}
        </span>
        {!past ? <span className="text-muted"> · {spotsLabel(sessionDate ? sessionTaken : taken, study.maxCapacity)}</span> : null}
        {hosting && !study.isPublic ? <span className="text-muted"> · Private</span> : null}
        {hosting ? <span className="text-canal"> · Your study</span> : null}
        {joined && !canceledDate ? <span className="text-canal"> · Joined</span> : null}
      </p>
      </Link>
        {!past && !hosting && !joined ? (
          <button
            type="button"
            className="absolute bottom-4 right-4 text-sm text-canal underline decoration-1 underline-offset-2 disabled:opacity-50"
            onClick={(event) => void requestCardJoin(event)}
            disabled={joinBusy || joinRequested}
          >
            {joinRequested ? 'Waiting for approval' : 'Join'}
          </button>
      ) : null}
    </div>
  );
}
