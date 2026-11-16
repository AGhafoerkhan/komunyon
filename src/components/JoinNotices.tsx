'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { Avatar } from '@/components/ui';
import { showDeviceNotice } from '@/lib/deviceNotices';
import { loadDepartureNotices, loadJoinNotices, subscribeDepartures, subscribeHostedStudies, dismissDeparture, type HostNotice } from '@/lib/studies';
import type { BibleStudy } from '@/types';

export function JoinNotices() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [requests, setRequests] = useState<HostNotice[]>([]);
  const [departures, setDepartures] = useState<HostNotice[]>([]);
  const [hosted, setHosted] = useState<BibleStudy[]>([]);
  const [requestsReady, setRequestsReady] = useState(false);
  const [departuresReady, setDeparturesReady] = useState(false);
  const primed = useRef(false);
  const seen = useRef<Set<string>>(new Set());
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!user) return;
    let active = true;
    const unsubscribe = subscribeHostedStudies(
      user.uid,
      (studies) => {
        if (!active) return;
        setHosted(studies);
        void loadJoinNotices(studies)
          .then((next) => {
            if (!active) return;
            setRequests(next);
            setRequestsReady(true);
          })
          .catch(() => {
            if (!active) return;
            setRequests([]);
            setRequestsReady(true);
          });
      },
      () => {
        if (active) setRequests([]);
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [user]);

  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeDepartures(
      hosted,
      (records) => {
        void loadDepartureNotices(hosted, records)
          .then((next) => {
            if (!active) return;
            setDepartures(next);
            setDeparturesReady(true);
          })
          .catch(() => {
            if (!active) return;
            setDepartures([]);
            setDeparturesReady(true);
          });
      },
      () => {
        if (active) setDepartures([]);
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [hosted]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  const notices = [...requests, ...departures].sort((a, b) => b.at.localeCompare(a.at));

  useEffect(() => {
    if (!user || !requestsReady || !departuresReady || primed.current) return;
    primed.current = true;
    seen.current = new Set(notices.map((notice) => notice.id));
  }, [user, requestsReady, departuresReady, notices]);

  useEffect(() => {
    if (!primed.current) return;
    for (const notice of notices) {
      if (seen.current.has(notice.id)) continue;
      seen.current.add(notice.id);
      if (document.hidden) void showDeviceNotice(notice);
    }
  }, [notices]);

  const count = notices.length;
  const label = count === 0 ? 'No notices' : `${count} ${count === 1 ? 'notice' : 'notices'}`;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={label}
        onClick={() => setOpen((current) => !current)}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-md text-ink hover:bg-sand"
      >
        <BellIcon />
        {count > 0 ? (
          <span className="absolute top-1 right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-canal px-1 text-[10px] font-medium text-white">
            {count > 9 ? '9+' : count}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          id={panelId}
          className="fixed right-4 left-4 z-20 mt-2 overflow-hidden rounded-lg border border-line bg-card shadow-lg top-[calc(3.5rem+env(safe-area-inset-top))] sm:top-[calc(4rem+env(safe-area-inset-top))] sm:right-6 sm:left-auto sm:w-80"
        >
          <p className="border-b border-line px-3 py-2 text-sm font-medium">Notices</p>
          {notices.length === 0 ? (
            <p className="px-3 py-6 text-sm text-muted">No one has requested to join, or left, a study you host.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {notices.map((notice) => (
                <li key={notice.id} className="border-b border-line last:border-b-0">
                  <div className="flex items-start gap-3 px-3 py-3">
                    <Link
                      href={`/studies/${notice.studyId}`}
                      onClick={() => setOpen(false)}
                      className="flex min-w-0 flex-1 items-start gap-3"
                    >
                      <Avatar src={notice.photoURL} name={notice.fullName} size={36} />
                      <span className="min-w-0">
                        <span className="block text-sm leading-snug break-words">
                          <span className="font-medium">{notice.fullName}</span>{' '}
                          {notice.kind === 'left'
                            ? 'left'
                            : notice.kind === 'cancelled'
                              ? 'cancelled their request'
                              : 'requested to join'}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted">{notice.studyTitle}</span>
                      </span>
                    </Link>
                    {notice.kind === 'request' ? null : (
                      <button
                        type="button"
                        className="shrink-0 text-xs text-muted hover:text-ink"
                        onClick={() => void dismissDeparture(notice.studyId, notice.userId)}
                      >
                        Dismiss
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M10 2.5a5 5 0 0 0-5 5v2.2c0 .7-.2 1.3-.6 1.9L3.4 13.2A1 1 0 0 0 4.2 14.8h11.6a1 1 0 0 0 .8-1.6l-1-1.6c-.4-.6-.6-1.2-.6-1.9V7.5a5 5 0 0 0-5-5Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M8 15.2a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
