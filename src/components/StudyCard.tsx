'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Avatar, FormatBadge, TagList } from '@/components/ui';
import { loadSessionAttendance, setSessionAttendance, subscribeSessionAttendance, subscribeSessionAttendanceList } from '@/lib/attendance';
import { cancellationNote, formatDdMmYyyy, formatSchedule, spotsLabel, upcomingSession, upcomingSessions } from '@/lib/format';
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
  const sessionDate = upcomingSession(study);
  const firstScheduledDate = study.format === 'recurring' && study.dayOfWeek !== null
    ? upcomingSessions(study.dayOfWeek, study.time, 1)[0] ?? null
    : study.date;
  const canceledDate = firstScheduledDate && study.skippedDates.includes(firstScheduledDate) ? firstScheduledDate : null;
  const displayedHostName = cardHostName(study.hostName);
  const [sessionTaken, setSessionTaken] = useState(taken);
  const [sessionJoined, setSessionJoined] = useState(false);
  const [attendanceBusy, setAttendanceBusy] = useState(false);

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

  return (
    <div
      className="flex h-[332px] w-full flex-col gap-3 overflow-hidden rounded-lg border border-line bg-card p-4 transition hover:border-canal/40"
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
      <h2 className="h-12 shrink-0 overflow-hidden font-serif text-xl leading-snug break-words">{study.title}</h2>
      <div className="-mt-2 flex h-6 shrink-0 items-start overflow-hidden">
        <TagList tags={study.tags} />
      </div>
      <div className="h-10 shrink-0 overflow-hidden text-sm text-muted">
        {canceledDate ? (
          <p>{formatDdMmYyyy(canceledDate)} · {study.time} · <span className="text-clay">Canceled</span></p>
        ) : (
          <p>{formatSchedule(study)}</p>
        )}
      </div>
      <p className={`h-10 shrink-0 overflow-hidden text-sm leading-relaxed line-clamp-2 ${canceledDate ? 'text-canal' : 'text-clay'}`}>
        {canceledDate ? `Next session: ${formatSchedule(study)}` : cancellationNote(study) || '\u00a0'}
      </p>
      <p className="mt-auto shrink-0 text-sm tabular-nums">
        <span className="font-medium text-ink">
          {sessionDate ? sessionTaken : taken} / {study.maxCapacity}
        </span>
        <span className="text-muted"> · {spotsLabel(sessionDate ? sessionTaken : taken, study.maxCapacity)}</span>
        {hosting && !study.isPublic ? <span className="text-muted"> · Private</span> : null}
        {hosting ? <span className="text-canal"> · Your study</span> : null}
        {joined && !canceledDate ? <span className="text-canal"> · Joined</span> : null}
      </p>
      </Link>
      {joined && sessionDate ? (
        <button
          type="button"
          className={`self-end text-sm underline underline-offset-2 disabled:opacity-50 ${sessionJoined ? 'text-clay decoration-black decoration-dashed' : 'text-canal decoration-1'}`}
          onClick={(event) => void toggleCardAttendance(event)}
          disabled={attendanceBusy || (!sessionJoined && sessionTaken >= study.maxCapacity)}
        >
          {sessionJoined ? 'Leave' : sessionTaken >= study.maxCapacity ? 'Full' : 'Join'}
        </button>
      ) : null}
    </div>
  );
}
