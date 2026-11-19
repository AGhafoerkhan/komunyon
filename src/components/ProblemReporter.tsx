'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { getLatestClientIssue, setServerAppVersion, submitIssueReport, type ClientIssue } from '@/lib/issueReports';

const message = 'Something went wrong. Contact support or try again later.';

export function ProblemReporter() {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [reported, setReported] = useState(false);
  const [pending, setPending] = useState(false);
  const [online, setOnline] = useState(true);
  const [versionMismatch, setVersionMismatch] = useState(false);
  const inFlight = useRef(new Set<string>());
  const sent = useRef(new Set<string>());

  const sendAutomatically = useCallback(async (issue: ClientIssue, attempt = 0) => {
    if (sent.current.has(issue.id) || inFlight.current.has(issue.id)) return;
    if (!user || !navigator.onLine) {
      setPending(true);
      return;
    }
    inFlight.current.add(issue.id);
    try {
      await submitIssueReport(user, issue);
      sent.current.add(issue.id);
      setPending(false);
      setReported(true);
    } catch (failure) {
      setPending(true);
      const code = typeof failure === 'object' && failure !== null && 'code' in failure
        ? String(failure.code)
        : '';
      const retryable = !code || ['unavailable', 'deadline-exceeded', 'resource-exhausted', 'internal', 'network-request-failed']
        .some((retryCode) => code.endsWith(retryCode));
      if (retryable && navigator.onLine && attempt < 4) {
        const delay = Math.min(2000 * (2 ** attempt), 30_000);
        window.setTimeout(() => void sendAutomatically(issue, attempt + 1), delay);
      }
    } finally {
      inFlight.current.delete(issue.id);
    }
  }, [user]);

  useEffect(() => {
    let active = true;
    const clientVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? 'local';
    void fetch('/api/version', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() as Promise<{ version?: unknown }> : null)
      .then((result) => {
        if (!active || typeof result?.version !== 'string' || result.version === 'unknown') return;
        setServerAppVersion(result.version);
        setVersionMismatch(result.version !== clientVersion);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    updateOnline();
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, []);

  useEffect(() => {
    const handleIssue = () => {
      setVisible(true);
      setReported(false);
      setPending(true);
      const issue = getLatestClientIssue();
      if (issue) void sendAutomatically(issue);
    };
    const retryPending = () => {
      const issue = getLatestClientIssue();
      if (issue) void sendAutomatically(issue);
    };
    if (getLatestClientIssue()) handleIssue();
    window.addEventListener('komunyon:issue', handleIssue);
    window.addEventListener('online', retryPending);
    return () => {
      window.removeEventListener('komunyon:issue', handleIssue);
      window.removeEventListener('online', retryPending);
    };
  }, [sendAutomatically]);

  if (!visible) return null;
  const pendingMessage = !user
    ? 'This report will be sent after you sign in.'
    : !online
      ? 'This report will be sent when you are back online.'
      : 'This report is queued and will retry automatically.';

  return (
    <aside
      aria-live="assertive"
      className="fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[100] mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3 rounded-lg border border-clay/40 bg-card px-4 py-3 text-ink shadow-lg"
    >
      <p className="min-w-48 flex-1 text-sm" role="alert">
        {reported ? 'Your problem has been reported!' : (
          <>
            {message}
            {pending ? <span className="mt-1 block text-xs text-muted">{pendingMessage}</span> : null}
            {versionMismatch ? <span className="mt-1 block text-xs text-muted">This app may be out of date. Refresh Komunyon and try again.</span> : null}
          </>
        )}
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <a
          className="inline-flex h-9 items-center justify-center rounded-md px-2 text-sm font-medium text-canal underline underline-offset-2"
          href="mailto:angeloghafoerkhan@gmail.com"
        >
          Contact support
        </a>
        <button
          type="button"
          aria-label="Dismiss error notice"
          onClick={() => setVisible(false)}
          className="inline-flex size-9 items-center justify-center rounded-md text-muted hover:bg-sand"
        >
          ×
        </button>
      </div>
    </aside>
  );
}
