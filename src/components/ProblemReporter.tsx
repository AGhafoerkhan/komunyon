'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { getLatestClientIssue, submitIssueReport } from '@/lib/issueReports';

const message = 'Something went wrong. Report a problem, contact support, or try again later.';

export function ProblemReporter() {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reported, setReported] = useState(false);
  const [submitFailed, setSubmitFailed] = useState(false);

  useEffect(() => {
    const show = () => {
      setVisible(true);
      setReported(false);
      setSubmitFailed(false);
    };
    if (getLatestClientIssue()) show();
    window.addEventListener('komunyon:issue', show);
    return () => window.removeEventListener('komunyon:issue', show);
  }, []);

  async function report() {
    if (!user || busy) return;
    setBusy(true);
    setSubmitFailed(false);
    try {
      await submitIssueReport(user);
      setReported(true);
    } catch {
      setSubmitFailed(true);
    } finally {
      setBusy(false);
    }
  }

  if (!visible) return null;

  return (
    <aside
      aria-live="assertive"
      className="fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[100] mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3 rounded-lg border border-clay/40 bg-card px-4 py-3 text-ink shadow-lg"
    >
      <p className="min-w-48 flex-1 text-sm" role="alert">
        {reported ? 'Problem reported. Contact support or try again later.' : submitFailed ? 'Could not report the problem. Contact support or try again later.' : message}
      </p>
      <div className="flex shrink-0 items-center gap-2">
        {!reported && user ? (
          <button
            type="button"
            onClick={() => void report()}
            disabled={busy}
            className="inline-flex h-9 items-center justify-center rounded-md bg-canal px-3 text-sm font-medium text-white hover:bg-canal-dark disabled:opacity-60"
          >
            {busy ? 'Sending…' : 'Report problem'}
          </button>
        ) : null}
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
