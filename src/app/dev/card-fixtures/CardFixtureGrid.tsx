'use client';

import { useState, type MouseEvent } from 'react';
import { StudyCardView, type StudyCardViewProps } from '@/components/StudyCardView';
import type { BibleStudy } from '@/types';

const allTags: BibleStudy['tags'] = ['bible-study', 'prayer-worship', 'communion', 'event', 'dinner'];

function makeStudy(overrides: Partial<BibleStudy> = {}): BibleStudy {
  return {
    id: 'fixture',
    hostId: 'host-1',
    hostName: 'Alexandria Supercalifragilisticexpialidocious',
    hostAge: 42,
    hostPhotoURL: '',
    title: 'Gathering '.repeat(12),
    description: 'A deterministic fixture for testing dashboard card boundaries without using Firebase data.',
    tags: allTags,
    format: 'recurring',
    dayOfWeek: 0,
    date: null,
    time: '19:00',
    maxCapacity: 8,
    area: 'Scheveningen, The Hague',
    isPublic: true,
    showMemberContacts: true,
    approvedCount: 8,
    pendingUserIds: [],
    approvedUserIds: [],
    invitedUserIds: [],
    skippedDates: [],
    createdAt: '2026-01-01T12:00:00.000Z',
    updatedAt: '2026-01-01T12:00:00.000Z',
    ...overrides,
  };
}

interface Fixture extends Omit<StudyCardViewProps, 'joinBusy' | 'onRequestJoin'> {
  id: string;
  label: string;
}

const fixtures: Fixture[] = [
  {
    id: 'host-long-full',
    label: 'Host, long title, five labels, full session',
    study: makeStudy({ id: 'host-long-full', hostId: 'viewer', isPublic: false, approvedCount: 8 }),
    hosting: true,
    joined: false,
    past: false,
    canceledDate: null,
    scheduleText: '22-11-2026 · 19:00',
    note: '',
    displayedHostName: 'A Supercalifragilisticexpialidocious',
    sessionDate: '2026-11-22',
    sessionTaken: 8,
    joinRequested: false,
  },
  {
    id: 'joined-canceled-week',
    label: 'Approved member, canceled next date',
    study: makeStudy({
      id: 'joined-canceled-week',
      approvedCount: 3,
      skippedDates: ['2026-11-22', '2026-11-29', '2026-12-06'],
    }),
    hosting: false,
    joined: true,
    past: false,
    canceledDate: '2026-11-22',
    scheduleText: '13-12-2026 · 19:00',
    note: 'Next session: 13-12-2026 · 19:00. The study resumes after several canceled weeks.',
    displayedHostName: 'A Supercalifragilisticexpialidocious',
    sessionDate: '2026-12-13',
    sessionTaken: 2,
    joinRequested: false,
  },
  {
    id: 'waiting-approval',
    label: 'Pending request',
    study: makeStudy({ id: 'waiting-approval', approvedCount: 1, tags: ['bible-study'] }),
    hosting: false,
    joined: false,
    past: false,
    canceledDate: null,
    scheduleText: '22-11-2026 · 19:00',
    note: '',
    displayedHostName: 'A Supercalifragilisticexpialidocious',
    sessionDate: '2026-11-22',
    sessionTaken: 1,
    joinRequested: true,
  },
  {
    id: 'visitor-all-tags',
    label: 'Visitor, all five labels and session full',
    study: makeStudy({ id: 'visitor-all-tags', approvedCount: 14 }),
    hosting: false,
    joined: false,
    past: false,
    canceledDate: null,
    scheduleText: '22-11-2026 · 19:00',
    note: '',
    displayedHostName: 'A Supercalifragilisticexpialidocious',
    sessionDate: '2026-11-22',
    sessionTaken: 8,
    joinRequested: false,
  },
  {
    id: 'one-off-past',
    label: 'Past one-off event',
    study: makeStudy({ id: 'one-off-past', format: 'one-off', dayOfWeek: null, date: '2020-01-01', tags: [] }),
    hosting: false,
    joined: false,
    past: true,
    canceledDate: null,
    scheduleText: '01-01-2020 · 19:00',
    note: 'This study has ended.',
    displayedHostName: 'A Supercalifragilisticexpialidocious',
    sessionDate: null,
    sessionTaken: 0,
    joinRequested: false,
  },
  {
    id: 'one-off-upcoming-minimum-title',
    label: 'Upcoming one-off, minimum title, no labels, no attendees',
    study: makeStudy({
      id: 'one-off-upcoming-minimum-title',
      title: 'Dinner',
      format: 'one-off',
      dayOfWeek: null,
      date: '2026-12-20',
      tags: [],
      approvedCount: 0,
    }),
    hosting: false,
    joined: false,
    past: false,
    canceledDate: null,
    scheduleText: '20-12-2026 · 19:00',
    note: '',
    displayedHostName: 'A Supercalifragilisticexpialidocious',
    sessionDate: '2026-12-20',
    sessionTaken: 0,
    joinRequested: false,
  },
];

export function CardFixtureGrid() {
  const [requested, setRequested] = useState(false);
  function requestLocalJoin(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    setRequested(true);
  }

  return (
    <main className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
      {fixtures.map((fixture) => (
        <section key={fixture.id} data-testid={`fixture-${fixture.id}`} aria-label={fixture.label} className="min-w-0">
          <h1 className="sr-only">{fixture.label}</h1>
          <StudyCardView
            {...fixture}
            joinBusy={false}
            joinRequested={fixture.id === 'visitor-all-tags' ? requested : fixture.joinRequested}
            onRequestJoin={requestLocalJoin}
          />
        </section>
      ))}
    </main>
  );
}
