'use client';

import { useEffect, useState } from 'react';
import { StudyCardView } from '@/components/StudyCardView';
import { loadSessionAttendance, setSessionAttendance, subscribeSessionAttendance, subscribeSessionAttendanceList } from '@/lib/attendance';
import { cancellationNote, formatSchedule, isPastStudy, upcomingSession, upcomingSessions } from '@/lib/format';
import { requestToJoin } from '@/lib/studies';
import type { BibleStudy } from '@/types';

function cardHostName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? fullName;
  return `${parts[0][0]?.toUpperCase() ?? ''} ${parts[parts.length - 1]}`;
}

export function StudyCard({ study, viewerId }: { study: BibleStudy; viewerId: string }) {
  const taken = study.approvedCount;
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
    <StudyCardView
      study={study}
      hosting={hosting}
      joined={joined}
      past={past}
      archived={study.archived}
      canceledDate={canceledDate}
      scheduleText={formatSchedule(study)}
      note={study.archived ? 'This event is archived.' : past ? 'This event has ended.' : canceledDate ? `Next session: ${formatSchedule(study)}` : cancellationNote(study) || ''}
      displayedHostName={displayedHostName}
      sessionDate={sessionDate}
      sessionTaken={sessionDate ? sessionTaken : taken}
      joinBusy={joinBusy}
      joinRequested={joinRequested}
      onRequestJoin={(event) => void requestCardJoin(event)}
    />
  );
}
