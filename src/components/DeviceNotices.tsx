'use client';

import { useEffect, useId, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { ModalDialog } from '@/components/ModalDialog';
import { Button } from '@/components/ui';
import {
  askDeviceNotices,
  beginNoticeAsk,
  clearNoticeAsk,
  deviceNoticePermission,
  installedApp,
  noticesEnabled,
  setNoticesEnabled,
  type DeviceNoticePermission,
} from '@/lib/deviceNotices';

export function NoticePermission() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [needsInstall, setNeedsInstall] = useState(false);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    if (pathname === '/logout') return;
    if (loading) return;
    if (!user) {
      clearNoticeAsk();
      setOpen(false);
      return;
    }
    if (deviceNoticePermission() !== 'default') return;
    const ask = beginNoticeAsk(user.uid);
    if (!ask) return;
    let active = true;
    void ask.promise.then((result) => {
      if (!active) return;
      if (result === 'granted') void setNoticesEnabled(true);
      if (result === 'denied') void setNoticesEnabled(false);
      if (result !== 'default') return;
      if (performance.now() - ask.started < 500) setOpen(true);
    });
    return () => {
      active = false;
    };
  }, [loading, pathname, user]);

  if (!open) return null;

  async function allow() {
    const result = await askDeviceNotices();
    if (result === 'granted') {
      await setNoticesEnabled(true);
      setOpen(false);
      return;
    }
    await setNoticesEnabled(false);
    if (result === 'default' && !installedApp()) {
      setNeedsInstall(true);
      return;
    }
    setOpen(false);
  }

  function dismiss() {
    void setNoticesEnabled(false);
    setOpen(false);
  }

  return (
    <ModalDialog
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onDismiss={dismiss}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-lg border border-line bg-card p-5 text-ink shadow-lg backdrop:bg-black/50"
    >
      <h2 id={titleId} className="font-serif text-2xl leading-tight">
        Allow notices
      </h2>
      <p id={bodyId} className="mt-2 text-sm leading-relaxed text-muted">
        A short alert when someone asks to join, cancels, or leaves a study you host.
      </p>
      {needsInstall ? (
        <p className="mt-3 text-sm text-muted">Add Komunyon to your home screen, then allow notices.</p>
      ) : null}
      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" className="w-full sm:w-auto" onClick={dismiss}>
          Not now
        </Button>
        <Button className="w-full sm:w-auto" onClick={() => void allow()}>
          Allow
        </Button>
      </div>
    </ModalDialog>
  );
}

export function DeviceNotices() {
  const [permission, setPermission] = useState<DeviceNoticePermission>('default');
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [needsInstall, setNeedsInstall] = useState(false);

  useEffect(() => {
    const next = deviceNoticePermission();
    setPermission(next);
    setOn(next === 'unsupported' ? false : noticesEnabled());
  }, []);

  if (permission === 'unsupported' || on === null) return null;

  async function toggle() {
    if (busy) return;
    if (on) {
      await setNoticesEnabled(false);
      setOn(false);
      setNeedsInstall(false);
      return;
    }
    setBusy(true);
    const result = await askDeviceNotices();
    setPermission(result);
    setBusy(false);
    if (result !== 'granted') {
      await setNoticesEnabled(false);
      setOn(false);
      setNeedsInstall(result === 'default' && !installedApp());
      return;
    }
    await setNoticesEnabled(true);
    setOn(true);
    setNeedsInstall(false);
  }

  return (
    <section className="mt-10 border-t border-line pt-6">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-serif text-xl">Notices</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            A short alert when someone asks to join, cancels, or leaves a study you host.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Notices"
          disabled={busy}
          onClick={() => void toggle()}
          className="inline-flex h-11 w-16 shrink-0 items-center justify-center disabled:opacity-50"
        >
          <span className={`relative inline-flex h-8 w-14 items-center rounded-full transition ${on ? 'bg-canal' : 'bg-line'}`}>
            <span
              className={`inline-block h-6 w-6 rounded-full bg-white shadow transition ${on ? 'translate-x-7' : 'translate-x-1'}`}
            />
          </span>
        </button>
      </div>
      {permission === 'denied' ? (
        <p className="mt-3 text-sm text-muted">Blocked. Allow Komunyon in this phone’s settings.</p>
      ) : null}
      {needsInstall ? (
        <p className="mt-3 text-sm text-muted">Add Komunyon to your home screen, then turn notices on.</p>
      ) : null}
    </section>
  );
}
