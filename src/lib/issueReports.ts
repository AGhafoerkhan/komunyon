'use client';

import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import type { User } from 'firebase/auth';

export interface ClientIssue {
  id: string;
  action: string;
  operation: string;
  target: string;
  route: string;
  version: string;
  serverVersion: string;
  name: string;
  code: string;
  message: string;
  stack: string;
  callerStack: string;
  recentActions: string;
  userAgent: string;
  occurredAt: string;
  online: boolean;
  networkDetails: string;
  visibility: string;
  timezone: string;
  locale: string;
  viewport: string;
}

export interface IssueContext {
  action: string;
  operation: string;
  target?: string;
}

let latestIssue: ClientIssue | null = null;
let serverAppVersion = 'unknown';
const recentActions: string[] = [];
const pendingIssueStorageKey = 'komunyon-pending-issue';

function persistLatestIssue(): void {
  if (typeof window === 'undefined' || !latestIssue) return;
  try {
    window.sessionStorage.setItem(pendingIssueStorageKey, JSON.stringify(latestIssue));
  } catch {
    // Storage may be unavailable in private browsing or when the browser is full.
  }
}

function restoreLatestIssue(): ClientIssue | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved: unknown = JSON.parse(window.sessionStorage.getItem(pendingIssueStorageKey) ?? 'null');
    if (typeof saved !== 'object' || saved === null) return null;
    const issue = saved as Partial<ClientIssue>;
    if (typeof issue.id !== 'string' || typeof issue.route !== 'string' || typeof issue.occurredAt !== 'string'
      || typeof issue.name !== 'string' || typeof issue.message !== 'string' || typeof issue.action !== 'string'
      || typeof issue.operation !== 'string' || typeof issue.target !== 'string' || typeof issue.version !== 'string'
      || typeof issue.serverVersion !== 'string' || typeof issue.code !== 'string' || typeof issue.stack !== 'string'
      || typeof issue.callerStack !== 'string' || typeof issue.recentActions !== 'string' || typeof issue.userAgent !== 'string'
      || typeof issue.online !== 'boolean' || typeof issue.visibility !== 'string' || typeof issue.timezone !== 'string'
      || typeof issue.networkDetails !== 'string' || typeof issue.locale !== 'string' || typeof issue.viewport !== 'string') return null;
    return issue as ClientIssue;
  } catch {
    return null;
  }
}

export function recordIssueBreadcrumb(action: string): void {
  if (typeof window === 'undefined') return;
  recentActions.push(`${new Date().toISOString()} ${redact(action, 100)}`);
  if (recentActions.length > 12) recentActions.shift();
}
let lastFingerprint = '';
let lastCapturedAt = 0;

function redact(value: string, maxLength: number): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/(https?:\/\/[^\s?]+)\?[^\s]*/gi, '$1?[redacted]')
    .replace(/((?:token|key|auth|session|sid|gsessionid|zx)=)[^&\s]+/gi, '$1[redacted]')
    .slice(0, maxLength);
}

function safeError(error: unknown): Pick<ClientIssue, 'name' | 'code' | 'message' | 'stack'> {
  const record = typeof error === 'object' && error !== null ? error as Record<string, unknown> : {};
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unexpected application error';
  return {
    name: redact(typeof record.name === 'string' ? record.name : 'Error', 120),
    code: redact(typeof record.code === 'string' ? record.code : '', 120),
    message: redact(message, 2000),
    stack: redact(error instanceof Error && typeof error.stack === 'string' ? error.stack : '', 12000),
  };
}

export function setServerAppVersion(version: string): void {
  serverAppVersion = version;
  if (latestIssue) {
    latestIssue.serverVersion = version;
    persistLatestIssue();
  }
}

export function captureClientIssue(error: unknown, context?: IssueContext): void {
  if (typeof window === 'undefined') return;
  const details = safeError(error);
  const fingerprint = `${window.location.pathname}|${context?.action ?? ''}|${context?.operation ?? ''}|${context?.target ?? ''}|${details.name}|${details.code}|${details.message}|${details.stack.slice(0, 500)}`;
  const now = Date.now();
  if (fingerprint === lastFingerprint && now - lastCapturedAt < 30_000) return;
  lastFingerprint = fingerprint;
  lastCapturedAt = now;
  latestIssue = {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${now}-${Math.random().toString(36).slice(2)}`,
    ...details,
    callerStack: redact(new Error('Issue capture callsite').stack ?? '', 6000),
    recentActions: recentActions.join('\n').slice(-2400),
    action: redact(context?.action ?? 'uncaught application error', 160),
    operation: redact(context?.operation ?? 'browser error handler', 240),
    target: redact(context?.target ?? '', 400),
    route: window.location.pathname.slice(0, 300),
    version: process.env.NEXT_PUBLIC_APP_VERSION ?? 'unknown',
    serverVersion: serverAppVersion,
    userAgent: redact(navigator.userAgent || 'unknown', 600),
    occurredAt: new Date().toISOString(),
    online: navigator.onLine,
    networkDetails: getNetworkDetails(),
    visibility: document.visibilityState,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone.slice(0, 80),
    locale: navigator.language.slice(0, 40),
    viewport: `${window.innerWidth}x${window.innerHeight}`,
  };
  persistLatestIssue();
  window.dispatchEvent(new Event('komunyon:issue'));
}

export function getLatestClientIssue(): ClientIssue | null {
  if (!latestIssue) latestIssue = restoreLatestIssue();
  return latestIssue;
}

export async function submitIssueReport(user: User, issue: ClientIssue): Promise<void> {
  const { getFirebase } = await import('@/lib/firebase');
  const { db } = getFirebase();
  await addDoc(collection(db, 'issueReports'), {
    reporterUid: user.uid,
    reporterEmail: user.email ?? '',
    action: issue.action,
    operation: issue.operation,
    target: issue.target,
    route: issue.route,
    version: `client=${issue.version}; server=${issue.serverVersion}`.slice(0, 100),
    browser: issue.userAgent,
    errorName: issue.name,
    errorCode: issue.code,
    errorMessage: issue.message,
    stack: issue.stack,
    callerStack: issue.callerStack,
    recentActions: issue.recentActions,
    occurredAt: issue.occurredAt,
    online: issue.online,
    networkDetails: issue.networkDetails,
    visibility: issue.visibility,
    timezone: issue.timezone,
    locale: issue.locale,
    viewport: issue.viewport,
    reportedAt: serverTimestamp(),
    status: 'new',
  });
  if (latestIssue?.id === issue.id) latestIssue = null;
  try {
    if (typeof window !== 'undefined') {
      const pending = restoreLatestIssue();
      if (pending?.id === issue.id) window.sessionStorage.removeItem(pendingIssueStorageKey);
    }
  } catch {
    // A sent issue should not fail because browser storage cleanup is unavailable.
  }
}

function getNetworkDetails(): string {
  const connection = (navigator as Navigator & {
    connection?: { type?: string; effectiveType?: string; rtt?: number; downlink?: number; saveData?: boolean };
  }).connection;
  const parts = [
    `type=${connection?.type ?? 'unknown'}`,
    `effective=${connection?.effectiveType ?? 'unknown'}`,
    `rttMs=${typeof connection?.rtt === 'number' ? connection.rtt : 'unknown'}`,
    `downlinkMbps=${typeof connection?.downlink === 'number' ? connection.downlink : 'unknown'}`,
    `saveData=${typeof connection?.saveData === 'boolean' ? connection.saveData : 'unknown'}`,
  ];
  return parts.join('; ').slice(0, 200);
}
