'use client';

import { useEffect, useId, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { Button } from '@/components/ui';
import {
  askDeviceNotices,
  beginNoticeAsk,
  clearNoticeAsk,
  deviceNoticePermission,
  installedApp,
  type DeviceNoticePermission,
} from '@/lib/deviceNotices';

export function NoticePermission() {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [needsInstall, setNeedsInstall] = useState(false);
  const titleId = useId();

  useEffect(() => {
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
      if (!active || result !== 'default') return;
      if (performance.now() - ask.started < 500) setOpen(true);
    });
    return () => {
      active = false;
    };
  }, [loading, user]);

  if (!open) return null;

  async function allow() {
    const result = await askDeviceNotices();
    if (result === 'default' && !installedApp()) {
      setNeedsInstall(true);
      return;
    }
    setOpen(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-md rounded-lg border border-line bg-card p-5 shadow-lg"
      >
        <h2 id={titleId} className="font-serif text-2xl leading-tight">
          Allow notices
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          A short alert when someone asks to join, cancels, or leaves a study you host.
        </p>
        {needsInstall ? (
          <p className="mt-3 text-sm text-muted">Add Komunyon to your home screen, then allow notices.</p>
        ) : null}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" className="w-full sm:w-auto" onClick={() => setOpen(false)}>
            Not now
          </Button>
          <Button className="w-full sm:w-auto" onClick={() => void allow()}>
            Allow
          </Button>
        </div>
      </div>
    </div>
  );
}

export function DeviceNotices() {
  const [permission, setPermission] = useState<DeviceNoticePermission>(deviceNoticePermission);
  const [needsInstall, setNeedsInstall] = useState(false);

  if (permission === 'unsupported') return null;

  async function allow() {
    const next = await askDeviceNotices();
    setPermission(next);
    setNeedsInstall(next === 'default' && !installedApp());
  }

  return (
    <section className="mt-10 border-t border-line pt-6">
      <h2 className="font-serif text-xl">Notices</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        A short alert when someone asks to join, cancels, or leaves a study you host.
      </p>
      {permission === 'granted' ? <p className="mt-3 text-sm">Allowed for Komunyon.</p> : null}
      {permission === 'denied' ? (
        <p className="mt-3 text-sm text-muted">Blocked. Allow Komunyon in this phone’s settings.</p>
      ) : null}
      {permission === 'default' ? (
        <Button variant="secondary" className="mt-4 w-full sm:w-auto" onClick={() => void allow()}>
          Allow
        </Button>
      ) : null}
      {needsInstall ? (
        <p className="mt-3 text-sm text-muted">Add Komunyon to your home screen, then allow notices.</p>
      ) : null}
    </section>
  );
}
