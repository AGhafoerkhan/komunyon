'use client';

import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import type { User } from 'firebase/auth';

export interface ClientIssue {
  route: string;
  version: string;
  name: string;
  code: string;
  message: string;
  stack: string;
  userAgent: string;
  occurredAt: string;
}

let latestIssue: ClientIssue | null = null;

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

export function captureClientIssue(error: unknown): void {
  if (typeof window === 'undefined') return;
  const details = safeError(error);
  latestIssue = {
    ...details,
    route: window.location.pathname.slice(0, 300),
    version: process.env.NEXT_PUBLIC_APP_VERSION ?? 'unknown',
    userAgent: redact(navigator.userAgent || 'unknown', 600),
    occurredAt: new Date().toISOString(),
  };
  window.dispatchEvent(new Event('komunyon:issue'));
}

export function getLatestClientIssue(): ClientIssue | null {
  return latestIssue;
}

export async function submitIssueReport(user: User): Promise<void> {
  if (!latestIssue) throw new Error('No issue details are available.');
  const { getFirebase } = await import('@/lib/firebase');
  const { db } = getFirebase();
  const issue = latestIssue;
  await addDoc(collection(db, 'issueReports'), {
    reporterUid: user.uid,
    reporterEmail: user.email ?? '',
    route: issue.route,
    version: issue.version,
    browser: issue.userAgent,
    errorName: issue.name,
    errorCode: issue.code,
    errorMessage: issue.message,
    stack: issue.stack,
    occurredAt: issue.occurredAt,
    reportedAt: serverTimestamp(),
    status: 'new',
  });
  if (latestIssue === issue) latestIssue = null;
}
