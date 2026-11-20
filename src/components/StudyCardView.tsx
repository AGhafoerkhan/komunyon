import Link from 'next/link';
import type { MouseEvent } from 'react';
import { Avatar, FormatBadge, TagList } from '@/components/ui';
import { formatDdMmYyyy, spotsLabel } from '@/lib/format';
import type { BibleStudy } from '@/types';

export interface StudyCardViewProps {
  study: BibleStudy;
  hosting: boolean;
  joined: boolean;
  past: boolean;
  canceledDate: string | null;
  scheduleText: string;
  note: string;
  displayedHostName: string;
  sessionDate: string | null;
  sessionTaken: number;
  joinBusy: boolean;
  joinRequested: boolean;
  onRequestJoin: (event: MouseEvent<HTMLButtonElement>) => void;
}

export function StudyCardView({
  study,
  hosting,
  joined,
  past,
  canceledDate,
  scheduleText,
  note,
  displayedHostName,
  sessionDate,
  sessionTaken,
  joinBusy,
  joinRequested,
  onRequestJoin,
}: StudyCardViewProps) {
  const hasJoinAction = !past && !hosting && !joined;

  return (
    <div
      data-testid="study-card"
      className="relative flex h-[320px] w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-card p-4 shadow-sm transition duration-200 hover:border-canal/40 hover:shadow-md"
    >
      <Link href={`/studies/${study.id}`} className="flex min-h-0 flex-1 flex-col gap-2">
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
          <div data-testid="card-date" className="mt-1 flex h-5 min-w-0 items-center gap-2 overflow-hidden rounded-md bg-sand/45 px-2.5 whitespace-nowrap text-sm text-muted">
            <span className="shrink-0 border-r border-line pr-2 text-[9px] font-semibold tracking-[0.12em] text-muted">STARTS</span>
            {canceledDate ? (
              <p className="truncate">{formatDdMmYyyy(canceledDate)} · {study.time} · <span className="text-clay">Canceled</span></p>
            ) : (
              <p className="truncate">{scheduleText}</p>
            )}
          </div>
        </div>

        <p
          data-testid="card-note"
          className={`h-9 shrink-0 overflow-hidden rounded-md px-2.5 py-1.5 text-sm leading-[18px] line-clamp-2 ${canceledDate ? 'bg-canal/5 text-canal' : note ? 'bg-clay/5 text-clay' : 'bg-transparent text-muted'}`}
        >
          {note || '\u00a0'}
        </p>
      </Link>

      <div
        data-testid="card-footer"
        className={`relative mt-auto flex h-10 shrink-0 items-center overflow-hidden rounded-lg border border-line/70 bg-sand/35 px-3 py-1.5 ${hasJoinAction ? 'pr-36' : ''}`}
      >
        <Link href={`/studies/${study.id}`} className="block min-w-0 flex-1 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-canal">
          <p className="text-[9px] font-semibold leading-3 tracking-[0.12em] text-muted">{past ? 'STATUS' : 'THIS SESSION'}</p>
          <p className="truncate text-xs leading-4 tabular-nums">
            <span className="font-semibold text-ink">
              {sessionDate ? sessionTaken : past ? 'Past' : study.approvedCount} {past ? '' : `/ ${study.maxCapacity}`}
            </span>
            {!past ? <span className="text-muted"> · {spotsLabel(sessionDate ? sessionTaken : study.approvedCount, study.maxCapacity)}</span> : null}
            {hosting && !study.isPublic ? <span className="text-muted"> · Private</span> : null}
            {hosting ? <span className="text-canal"> · Your study</span> : null}
            {joined && !canceledDate ? <span className="text-canal"> · Joined</span> : null}
          </p>
        </Link>
        {hasJoinAction ? (
          <button
            data-testid="card-join"
            type="button"
            className="absolute bottom-1 right-1 inline-flex h-8 items-center justify-center rounded-md border border-canal/35 bg-canal/10 px-3 text-sm font-semibold text-canal transition hover:bg-canal/15 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onRequestJoin}
            disabled={joinBusy || joinRequested}
          >
            {joinRequested ? 'Waiting for approval' : 'Join'}
          </button>
        ) : null}
      </div>
    </div>
  );
}
