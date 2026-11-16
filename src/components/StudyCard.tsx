'use client';

import Link from 'next/link';
import { Avatar, FormatBadge, TagList } from '@/components/ui';
import { cancellationNote, formatSchedule, spotsLabel } from '@/lib/format';
import type { BibleStudy } from '@/types';

export function StudyCard({ study, viewerId }: { study: BibleStudy; viewerId: string }) {
  const taken = study.approvedUserIds.length;
  const hosting = study.hostId === viewerId;

  return (
    <Link
      href={`/studies/${study.id}`}
      className="flex h-full flex-col gap-3 rounded-lg border border-line bg-card p-4 transition hover:border-canal/40"
    >
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
      <h2 className="font-serif text-xl leading-snug break-words">{study.title}</h2>
      <TagList tags={study.tags} />
      <p className="text-sm break-words text-muted">{formatSchedule(study)}</p>
      {cancellationNote(study) ? <p className="text-sm leading-relaxed text-clay">{cancellationNote(study)}</p> : null}
      <p className="mt-auto text-sm tabular-nums">
        <span className="font-medium text-ink">
          {taken} / {study.maxCapacity}
        </span>
        <span className="text-muted"> · {spotsLabel(taken, study.maxCapacity)}</span>
        {hosting && !study.isPublic ? <span className="text-muted"> · Private</span> : null}
        {hosting ? <span className="text-canal"> · Your study</span> : null}
      </p>
    </Link>
  );
}
