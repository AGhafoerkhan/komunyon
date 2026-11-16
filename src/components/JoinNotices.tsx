'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { Avatar } from '@/components/ui';
import { loadJoinNotices, subscribeHostedStudies, type JoinNotice } from '@/lib/studies';

export function JoinNotices() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [notices, setNotices] = useState<JoinNotice[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!user) return;
    let active = true;
    const unsubscribe = subscribeHostedStudies(
      user.uid,
      (studies) => {
        void loadJoinNotices(studies)
          .then((next) => {
            if (active) setNotices(next);
          })
          .catch(() => {
            if (active) setNotices([]);
          });
      },
      () => {
        if (active) setNotices([]);
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [user]);

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

  const count = notices.length;
  const label = count === 0 ? 'No join requests' : `${count} join ${count === 1 ? 'request' : 'requests'}`;

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
          <p className="border-b border-line px-3 py-2 text-sm font-medium">Join requests</p>
          {notices.length === 0 ? (
            <p className="px-3 py-6 text-sm text-muted">No one is waiting to join a study you host.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {notices.map((notice) => (
                <li key={notice.id} className="border-b border-line last:border-b-0">
                  <Link
                    href={`/studies/${notice.studyId}`}
                    onClick={() => setOpen(false)}
                    className="flex items-start gap-3 px-3 py-3 hover:bg-sand"
                  >
                    <Avatar src={notice.photoURL} name={notice.fullName} size={36} />
                    <span className="min-w-0">
                      <span className="block text-sm leading-snug break-words">
                        <span className="font-medium">{notice.fullName}</span> requested to join
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted">{notice.studyTitle}</span>
                    </span>
                  </Link>
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
