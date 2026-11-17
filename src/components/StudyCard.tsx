'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Avatar, FormatBadge, TagList } from '@/components/ui';
import { loadSessionAttendance } from '@/lib/attendance';
import { cancellationNote, formatSchedule, spotsLabel, upcomingSession } from '@/lib/format';
import type { BibleStudy } from '@/types';

export function StudyCard({ study, viewerId }: { study: BibleStudy; viewerId: string }) {
  const taken = study.approvedUserIds.length;
  const hosting = study.hostId === viewerId;
  const joined = !hosting && study.approvedUserIds.includes(viewerId);
  const sessionDate = upcomingSession(study);
  const [sessionTaken, setSessionTaken] = useState(taken);

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

  return (
    <Link
      href={`/studies/${study.id}`}
      className="flex h-[332px] w-full flex-col gap-3 overflow-hidden rounded-lg border border-line bg-card p-4 transition hover:border-canal/40"
    >
      <div className="flex h-10 shrink-0 items-start justify-between gap-3">
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
      <h2 className="h-12 shrink-0 overflow-hidden font-serif text-xl leading-snug break-words">{study.title}</h2>
      <div className="flex h-6 shrink-0 items-start overflow-hidden">
        <TagList tags={study.tags} />
      </div>
      <p className="h-5 shrink-0 overflow-hidden text-sm break-words text-muted">{formatSchedule(study)}</p>
      <p className="h-10 shrink-0 overflow-hidden text-sm leading-relaxed text-clay line-clamp-2">
        {cancellationNote(study) || '\u00a0'}
      </p>
      <p className="mt-auto shrink-0 text-sm tabular-nums">
        <span className="font-medium text-ink">
          {sessionDate ? sessionTaken : taken} / {study.maxCapacity}
        </span>
        <span className="text-muted"> · {spotsLabel(sessionDate ? sessionTaken : taken, study.maxCapacity)}</span>
        {hosting && !study.isPublic ? <span className="text-muted"> · Private</span> : null}
        {hosting ? <span className="text-canal"> · Your study</span> : null}
        {joined ? <span className="text-canal"> · Joined</span> : null}
      </p>
    </Link>
  );
}
