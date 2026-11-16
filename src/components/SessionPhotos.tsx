'use client';

import Link from 'next/link';
import { formatDdMmYyyy, historySessions, upcomingSession } from '@/lib/format';
import type { BibleStudy } from '@/types';

export function SessionPhotos({ study }: { study: BibleStudy }) {
  const dates = historySessions(study);
  const next = upcomingSession(study);

  if (dates.length === 0) {
    return <p className="text-sm text-muted">Canceled sessions stay off this list.</p>;
  }

  return (
    <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {dates.map((date) => (
        <li key={date}>
          <Link
            href={`/studies/${study.id}/history/${date}`}
            className="flex h-full min-h-28 flex-col justify-between rounded-lg border border-line bg-card p-4 hover:bg-sand"
          >
            <span className="text-xs uppercase tracking-wide text-muted">{date === next ? 'Next' : 'Session'}</span>
            <span className="text-sm font-medium text-ink">{formatDdMmYyyy(date)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
