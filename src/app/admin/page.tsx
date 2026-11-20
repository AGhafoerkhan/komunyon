'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, doc, getDocs, limit, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useAuth } from '@/components/AuthProvider';
import { Button, LoadingScreen, pageTitleClass } from '@/components/ui';
import { getFirebase } from '@/lib/firebase';
import { useSuccessToast } from '@/components/SuccessToast';

const OWNER_EMAIL = 'angeloleeuw@gmail.com';
const statuses = ['new', 'investigating', 'fixed', 'wontfix'] as const;
type IssueStatus = typeof statuses[number];

interface IssueReport {
  id: string;
  reporterUid: string;
  reporterEmail: string;
  action: string;
  operation: string;
  target: string;
  route: string;
  version: string;
  browser: string;
  errorName: string;
  errorCode: string;
  errorMessage: string;
  stack: string;
  callerStack: string;
  recentActions: string;
  occurredAt: string;
  online: boolean | null;
  networkDetails: string;
  visibility: string;
  timezone: string;
  locale: string;
  viewport: string;
  reportedAt: Date | null;
  status: IssueStatus;
  adminNotes: string;
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asStatus(value: unknown): IssueStatus {
  return statuses.includes(value as IssueStatus) ? value as IssueStatus : 'new';
}

export default function AdminPage() {
  const { showSuccess } = useSuccessToast();
  const { user } = useAuth();
  const isOwner = user?.email?.toLowerCase() === OWNER_EMAIL;
  const [reports, setReports] = useState<IssueReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [personFilter, setPersonFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusDraft, setStatusDraft] = useState<IssueStatus>('new');
  const [notesDraft, setNotesDraft] = useState('');

  const loadReports = useCallback(async () => {
    if (!isOwner) return;
    setLoading(true);
    setLoadError(false);
    try {
      const snapshot = await getDocs(query(collection(getFirebase().db, 'issueReports'), orderBy('reportedAt', 'desc'), limit(200)));
      const next = snapshot.docs.map((item) => {
        const data = item.data();
        return {
          id: item.id,
          reporterUid: asText(data.reporterUid),
          reporterEmail: asText(data.reporterEmail),
          action: asText(data.action),
          operation: asText(data.operation),
          target: asText(data.target),
          route: asText(data.route),
          version: asText(data.version),
          browser: asText(data.browser),
          errorName: asText(data.errorName),
          errorCode: asText(data.errorCode),
          errorMessage: asText(data.errorMessage),
          stack: asText(data.stack),
          callerStack: asText(data.callerStack),
          recentActions: asText(data.recentActions),
          occurredAt: asText(data.occurredAt),
          online: typeof data.online === 'boolean' ? data.online : null,
          networkDetails: asText(data.networkDetails),
          visibility: asText(data.visibility),
          timezone: asText(data.timezone),
          locale: asText(data.locale),
          viewport: asText(data.viewport),
          reportedAt: data.reportedAt && typeof data.reportedAt.toDate === 'function' ? data.reportedAt.toDate() : null,
          status: asStatus(data.status),
          adminNotes: asText(data.adminNotes),
        } satisfies IssueReport;
      });
      setReports(next);
      setSelectedId((current) => current && next.some((report) => report.id === current) ? current : next[0]?.id ?? null);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [isOwner]);

  useEffect(() => {
    if (!user) return;
    if (isOwner) void loadReports();
    else setLoading(false);
  }, [isOwner, loadReports, user]);

  const people = useMemo(() => [...new Set(reports.map((report) => report.reporterEmail || report.reporterUid))].sort(), [reports]);
  const actions = useMemo(() => [...new Set(reports.map((report) => report.action).filter(Boolean))].sort(), [reports]);
  const filtered = useMemo(() => reports.filter((report) => {
    const person = report.reporterEmail || report.reporterUid;
    return (personFilter === 'all' || person === personFilter)
      && (statusFilter === 'all' || report.status === statusFilter)
      && (actionFilter === 'all' || report.action === actionFilter);
  }), [actionFilter, personFilter, reports, statusFilter]);
  const selected = filtered.find((report) => report.id === selectedId) ?? filtered[0] ?? null;

  useEffect(() => {
    if (!selected) return;
    setStatusDraft(selected.status);
    setNotesDraft(selected.adminNotes);
  }, [selected?.id]);

  async function saveReport() {
    if (!selected) return;
    setBusy(true);
    try {
      await updateDoc(doc(getFirebase().db, 'issueReports', selected.id), {
        status: statusDraft,
        adminNotes: notesDraft.slice(0, 2000),
        updatedAt: serverTimestamp(),
      });
      setReports((current) => current.map((report) => report.id === selected.id
        ? { ...report, status: statusDraft, adminNotes: notesDraft.slice(0, 2000) }
        : report));
      showSuccess('Issue report saved.');
    } catch {
      setLoadError(true);
    } finally {
      setBusy(false);
    }
  }

  if (!user || loading) return <LoadingScreen />;

  if (!isOwner) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 px-5 py-12">
        <h1 className={pageTitleClass}>Not available</h1>
        <p className="text-sm text-muted">This page is not available for this account.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-5 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted">Komunyon · Developer tools</p>
          <h1 className={`${pageTitleClass} mt-1`}>Issue reports</h1>
        </div>
        <Button variant="secondary" onClick={() => void loadReports()} disabled={loading}>Refresh reports</Button>
      </header>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Report summary">
        <Summary label="Reports shown" value={String(filtered.length)} />
        <Summary label="New" value={String(reports.filter((report) => report.status === 'new').length)} />
        <Summary label="People" value={String(people.length)} />
      </section>

      <section className="grid gap-4 sm:grid-cols-3" aria-label="Report filters">
        <label className="text-sm font-medium">Person
          <select className="mt-1 block min-h-11 w-full rounded-md border border-line bg-card px-3 text-base text-ink" value={personFilter} onChange={(event) => setPersonFilter(event.target.value)}>
            <option value="all">All people</option>
            {people.map((person) => <option key={person} value={person}>{person}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">Status
          <select className="mt-1 block min-h-11 w-full rounded-md border border-line bg-card px-3 text-base text-ink" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All statuses</option>
            {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">Action
          <select className="mt-1 block min-h-11 w-full rounded-md border border-line bg-card px-3 text-base text-ink" value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
            <option value="all">All actions</option>
            {actions.map((action) => <option key={action} value={action}>{action}</option>)}
          </select>
        </label>
      </section>

      {loadError ? <p role="alert" className="rounded-md border border-clay/30 bg-clay/5 p-3 text-sm text-clay">Could not load or save reports. Try again later.</p> : null}
      {loading ? <LoadingScreen label="Loading reports" /> : null}
      {!loading && filtered.length === 0 ? <p className="rounded-lg border border-line bg-card p-5 text-sm text-muted">No issue reports match these filters.</p> : null}

      <section className="grid gap-5 lg:grid-cols-[minmax(16rem,0.8fr)_minmax(0,1.4fr)]">
        <div className="flex flex-col gap-2" aria-label="Issue report list">
          {filtered.map((report) => (
            <button
              type="button"
              key={report.id}
              onClick={() => setSelectedId(report.id)}
              aria-current={selected?.id === report.id ? 'true' : undefined}
              className={`w-full rounded-lg border p-4 text-left transition ${selected?.id === report.id ? 'border-canal bg-canal/5' : 'border-line bg-card hover:bg-sand/50'}`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold">{report.reporterEmail || report.reporterUid || 'Unknown user'}</span>
                <span className="shrink-0 rounded px-2 py-0.5 text-xs capitalize text-muted">{report.status}</span>
              </span>
              <span className="mt-2 block truncate text-sm">{report.errorCode || report.errorName || 'Application error'} · {report.route || '/'}</span>
              <span className="mt-1 block text-xs text-muted">Occurred {new Date(report.occurredAt).toLocaleString()} · Reported {report.reportedAt?.toLocaleString() ?? 'time unavailable'}</span>
            </button>
          ))}
        </div>

        {selected ? (
          <article className="min-w-0 rounded-lg border border-line bg-card p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-serif text-2xl">{selected.errorName || 'Application error'}</h2>
                <p className="mt-1 break-all text-sm text-muted">{selected.errorCode || 'No error code'} · {selected.reporterEmail || selected.reporterUid}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted">{selected.reportedAt?.toLocaleString() ?? selected.occurredAt}</span>
                <CopyButton text={formatFullReport(selected)} label="full report" />
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4">
              <h3 className="text-sm font-semibold">Report details</h3>
              <CopyButton text={formatReportDetails(selected)} label="report details" />
            </div>
            <dl className="mt-5 grid gap-3 border-y border-line py-4 text-sm sm:grid-cols-2">
              <Detail label="Action" value={selected.action || 'Not captured'} />
              <Detail label="Operation" value={selected.operation || 'Not captured'} />
              <Detail label="Firestore target" value={selected.target || 'Not captured'} />
              <Detail label="Page" value={selected.route || '—'} />
              <Detail label="App version" value={selected.version || 'unknown'} />
              <Detail label="User ID" value={selected.reporterUid || '—'} />
              <Detail label="Occurred" value={selected.occurredAt || '—'} />
              <Detail label="Browser and device" value={selected.browser || '—'} />
              <Detail label="Network online" value={selected.online === null ? 'Unknown' : selected.online ? 'Yes' : 'No'} />
              <Detail label="Connection details" value={selected.networkDetails || 'Not captured'} />
              <Detail label="Tab visibility" value={selected.visibility || '—'} />
              <Detail label="Locale / timezone" value={`${selected.locale || '—'} / ${selected.timezone || '—'}`} />
              <Detail label="Viewport" value={selected.viewport || '—'} />
              <Detail label="Reported" value={selected.reportedAt?.toLocaleString() ?? '—'} />
            </dl>

            <section className="mt-5">
              <LogHeading title="Recent app actions" text={selected.recentActions || 'No recent action trail was captured.'} />
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-sand/60 p-3 text-xs">{selected.recentActions || 'No recent action trail was captured.'}</pre>
            </section>

            <section className="mt-5">
              <LogHeading title="Error details" text={selected.errorMessage || 'No error message was captured.'} />
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-sand/60 p-3 text-xs">{selected.errorMessage || 'No error message was captured.'}</pre>
            </section>
            <section className="mt-4">
              <LogHeading title="Stack trace" text={selected.stack || 'No stack trace was captured.'} />
              <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-md bg-sand/60 p-3 text-xs">{selected.stack || 'No stack trace was captured.'}</pre>
            </section>
            <section className="mt-4">
              <LogHeading title="Error handling callsite" text={selected.callerStack || 'No callsite was captured.'} />
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md bg-sand/60 p-3 text-xs">{selected.callerStack || 'No callsite was captured.'}</pre>
            </section>

            <section className="mt-5 grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
              <label className="text-sm font-medium">Status
                <select className="mt-1 block min-h-11 w-full rounded-md border border-line bg-card px-3 text-base text-ink" value={statusDraft} onChange={(event) => setStatusDraft(asStatus(event.target.value))}>
                  {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium sm:col-span-2">Developer notes
                <textarea className="mt-1 block min-h-24 w-full rounded-md border border-line bg-card p-3 text-base text-ink" maxLength={2000} value={notesDraft} onChange={(event) => setNotesDraft(event.target.value)} />
              </label>
              <div className="flex items-center gap-3 sm:col-span-2">
                <Button onClick={() => void saveReport()} disabled={busy}>{busy ? 'Saving…' : 'Save report'}</Button>
              </div>
            </section>
          </article>
        ) : null}
      </section>
    </main>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-line bg-card p-4"><p className="text-xs text-muted">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 break-words">{value}</dd></div>;
}

function LogHeading({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      <CopyButton text={text} label={title.toLowerCase()} />
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const input = document.createElement('textarea');
        input.value = text;
        input.setAttribute('readonly', '');
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.append(input);
        input.select();
        const succeeded = document.execCommand('copy');
        input.remove();
        if (!succeeded) throw new Error('Clipboard copy was not available.');
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="inline-flex min-h-9 shrink-0 items-center rounded-md border border-line px-3 text-xs font-medium text-ink hover:bg-sand"
      aria-label={`Copy ${label}`}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function formatReportDetails(report: IssueReport): string {
  return [
    `Action: ${report.action || 'Not captured'}`,
    `Operation: ${report.operation || 'Not captured'}`,
    `Firestore target: ${report.target || 'Not captured'}`,
    `Page: ${report.route || '—'}`,
    `App version: ${report.version || 'unknown'}`,
    `Reporter: ${report.reporterEmail || report.reporterUid || 'Unknown'}`,
    `User ID: ${report.reporterUid || '—'}`,
    `Occurred: ${report.occurredAt || '—'}`,
    `Reported: ${report.reportedAt?.toLocaleString() ?? '—'}`,
    `Browser and device: ${report.browser || '—'}`,
    `Network online: ${report.online === null ? 'Unknown' : report.online ? 'Yes' : 'No'}`,
    `Connection details: ${report.networkDetails || 'Not captured'}`,
    `Tab visibility: ${report.visibility || '—'}`,
    `Locale / timezone: ${report.locale || '—'} / ${report.timezone || '—'}`,
    `Viewport: ${report.viewport || '—'}`,
  ].join('\n');
}

function formatFullReport(report: IssueReport): string {
  return [
    'Komunyon issue report',
    formatReportDetails(report),
    `Status: ${report.status}`,
    `Admin notes: ${report.adminNotes || '—'}`,
    '',
    'Error',
    `${report.errorName || 'Application error'} · ${report.errorCode || 'No error code'}`,
    report.errorMessage || 'No error message was captured.',
    '',
    'Recent app actions',
    report.recentActions || 'No recent action trail was captured.',
    '',
    'Stack trace',
    report.stack || 'No stack trace was captured.',
    '',
    'Error handling callsite',
    report.callerStack || 'No callsite was captured.',
  ].join('\n');
}
