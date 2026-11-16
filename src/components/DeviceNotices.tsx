'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import { askDeviceNotices, deviceNoticePermission, installedApp, type DeviceNoticePermission } from '@/lib/deviceNotices';

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
