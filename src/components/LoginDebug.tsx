'use client';

import { useSyncExternalStore, useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { currentAuthDomain, loginSignInMode } from '@/lib/firebase';
import {
  captureLoginDebugRequest,
  clearLoginDebug,
  loginDebugEnabled,
  loginLogLines,
  readAuthIndexedDb,
  readableCookieLines,
  storageKeyLines,
  subscribeLoginDebug,
} from '@/lib/loginDebug';
import { isProfileReady } from '@/lib/validate';

const EMPTY: string[] = [];

export function LoginDebug() {
  const enabled = useSyncExternalStore(subscribeLoginDebug, loginDebugEnabled, () => false);
  const events = useSyncExternalStore(subscribeLoginDebug, loginLogLines, () => EMPTY);
  const { user, profile, loading, error, signInError, configured } = useAuth();
  const [storageLines, setStorageLines] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    captureLoginDebugRequest();
    let active = true;
    void readAuthIndexedDb().then((lines) => {
      if (active) setStorageLines(lines);
    });
    return () => {
      active = false;
    };
  }, [enabled, user, loading]);

  if (!enabled) return null;

  const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  const provider = user?.providerData[0]?.providerId ?? 'none';
  const stored = (read: () => string[]) => {
    try {
      return read();
    } catch {
      return ['storage: blocked'];
    }
  };
  const report = [
    'Komunyon login debug',
    'Open with https://komunyon.vercel.app/?debug=1',
    `url: ${window.location.href}`,
    `navigation: ${navigation?.type ?? 'unknown'}`,
    `browser: ${navigator.userAgent}`,
    `sign-in method for this browser: ${loginSignInMode()}`,
    `auth domain: ${currentAuthDomain()}`,
    `firebase configured: ${configured ? 'yes' : 'no'}`,
    `cookies enabled: ${navigator.cookieEnabled ? 'yes' : 'no'}`,
    `logged in: ${user ? 'yes' : 'no'}`,
    `auth loading: ${loading ? 'yes' : 'no'}`,
    `uid: ${user?.uid ?? 'none'}`,
    `email: ${user?.email ?? 'none'}`,
    `provider: ${provider}`,
    `last sign-in: ${user?.metadata.lastSignInTime ?? 'none'}`,
    `profile: ${profile ? (isProfileReady(profile) ? 'ready' : 'incomplete') : 'none'}`,
    `profile error: ${error ?? 'none'}`,
    `sign-in error: ${signInError ?? 'none'}`,
    `service worker: ${navigator.serviceWorker?.controller ? 'controlling this page' : 'not controlling this page'}`,
    ...stored(readableCookieLines),
    ...stored(() => storageKeyLines(localStorage, 'localStorage')),
    ...stored(() => storageKeyLines(sessionStorage, 'sessionStorage')),
    ...storageLines,
    'events:',
    ...(events.length > 0 ? events : ['(none yet)']),
  ].join('\n');

  async function copy() {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="relative z-10 w-full border-b border-[#2b303b] bg-[#10140f] text-left text-[#d5f5c8]">
      <div className="mx-auto w-full max-w-2xl px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-serif text-lg text-[#f0f2f4]">Login debug</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void copy()}
              className="h-8 rounded-md border border-[#4db3a2] px-3 text-xs text-[#dbf0ec]"
            >
              {copied ? 'Copied' : 'Copy log'}
            </button>
            <button
              type="button"
              onClick={clearLoginDebug}
              className="h-8 rounded-md border border-[#2b303b] px-3 text-xs text-[#a7afbe]"
            >
              Hide
            </button>
          </div>
        </div>
        <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed">
          {report}
        </pre>
      </div>
    </section>
  );
}
