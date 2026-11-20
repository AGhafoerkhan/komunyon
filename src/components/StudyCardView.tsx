import Link from 'next/link';
import type { MouseEvent } from 'react';
import { Avatar, FormatBadge, TagList } from '@/components/ui';
import { formatDdMmYyyy, spotsLabel } from '@/lib/format';
import type { BibleStudy } from '@/types';

export interface StudyCardViewProps {
  study: BibleStudy;
  href?: string;
  hosting: boolean;
  joined: boolean;
  past: boolean;
  archived?: boolean;
  canceledDate: string | null;
  scheduleText: string;
  note: string;
  displayedHostName: string;
  sessionDate: string | null;
  sessionTaken: number;
  joinBusy: boolean;
  joinRequested: boolean;
  onRequestJoinWarm?: () => void;
  onRequestJoin: (event: MouseEvent<HTMLButtonElement>) => void;
}

export function StudyCardView({
  study,
  href,
  hosting,
  joined,
  past,
  archived = false,
  canceledDate,
  scheduleText,
  note,
  displayedHostName,
  sessionDate,
  sessionTaken,
  joinBusy,
  joinRequested,
  onRequestJoinWarm,
  onRequestJoin,
}: StudyCardViewProps) {
  const hasJoinAction = !past && !archived && !hosting && !joined;
  const studyHref = href ?? `/studies/${study.id}`;

  return (
    <div
      data-testid="study-card"
      className="relative flex h-[320px] w-full min-w-0 flex-col overflow-hidden rounded-lg border border-line bg-card p-4 transition hover:border-canal/40"
    >
      <Link href={studyHref} className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex h-10 shrink-0 items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar src={study.hostPhotoURL} name={study.hostName} size={36} />
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

        <div data-testid="card-details" className="h-[136px] shrink-0 overflow-hidden">
          <h2 data-testid="card-title" className="line-clamp-2 h-14 overflow-hidden break-words font-serif text-xl leading-7">
            {study.title}
          </h2>
          <div data-testid="card-tags" className="mt-0.5 h-12 overflow-hidden">
            <TagList tags={study.tags} />
          </div>
          <div data-testid="card-date" className="mt-1 h-5 overflow-hidden whitespace-nowrap text-sm text-muted">
            {canceledDate ? (
              <p>{formatDdMmYyyy(canceledDate)} · {study.time} · <span className="text-clay">Canceled</span></p>
            ) : (
              <p>{scheduleText}</p>
            )}
          </div>
        </div>

        <p
          data-testid="card-note"
          className={`h-9 shrink-0 overflow-hidden text-sm leading-[18px] line-clamp-2 ${canceledDate ? 'text-canal' : note ? 'text-clay' : 'text-muted'}`}
        >
          {note || '\u00a0'}
        </p>

        <p
          data-testid="card-footer"
          className={`mt-auto h-10 shrink-0 overflow-hidden text-[13px] leading-5 tabular-nums line-clamp-2 ${hasJoinAction ? 'pr-36' : ''}`}
        >
          <span className="font-medium text-ink">
            {sessionDate ? sessionTaken : past ? 'Past' : study.approvedCount} {past ? '' : `/ ${study.maxCapacity}`}
          </span>
          {!past ? <span className="text-muted"> · {spotsLabel(sessionDate ? sessionTaken : study.approvedCount, study.maxCapacity)}</span> : null}
          {hosting && !study.isPublic ? <span className="text-muted"> · Private</span> : null}
          {hosting ? <span className="text-canal"> · Your event</span> : null}
          {archived ? <span className="text-muted"> · Archived</span> : null}
          {joined && !canceledDate ? <span className="text-canal"> · Joined</span> : null}
        </p>
      </Link>

      {hasJoinAction ? (
        <button
          data-testid="card-join"
          type="button"
          className="absolute bottom-4 right-4 whitespace-nowrap text-sm text-canal underline decoration-1 underline-offset-2 disabled:opacity-50"
          onPointerDown={onRequestJoinWarm}
          onClick={onRequestJoin}
          disabled={joinBusy || joinRequested}
        >
          {joinRequested ? 'Waiting for approval' : 'Join'}
        </button>
      ) : null}
    </div>
  );
}
