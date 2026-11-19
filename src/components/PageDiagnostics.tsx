'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { captureClientIssue, recordIssueBreadcrumb } from '@/lib/issueReports';

function errorDetails(value: unknown) {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return { message: typeof value === 'string' ? value : 'Unhandled non-error rejection' };
}

/** Shared route and uncaught-error diagnostics for every page. */
export function PageDiagnostics() {
  const pathname = usePathname();

  useEffect(() => {
    recordIssueBreadcrumb(`opened ${pathname}`);
    console.info('[Komunyon][Page] loaded', {
      pathname,
      at: new Date().toISOString(),
    });

    const onError = (event: ErrorEvent) => {
      captureClientIssue(event.error ?? event.message, {
        action: 'uncaught browser error',
        operation: 'window error event',
        target: event.filename ? `${event.filename}:${event.lineno ?? 0}:${event.colno ?? 0}` : pathname,
      });
      console.error('[Komunyon][Page] uncaught error', {
        pathname,
        at: new Date().toISOString(),
        ...errorDetails(event.error ?? event.message),
        source: event.filename,
        line: event.lineno,
        column: event.colno,
      });
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      captureClientIssue(event.reason, {
        action: 'unhandled asynchronous operation',
        operation: 'window unhandledrejection event',
        target: pathname,
      });
      console.error('[Komunyon][Page] unhandled promise rejection', {
        pathname,
        at: new Date().toISOString(),
        ...errorDetails(event.reason),
      });
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const control = target.closest('button, a, [role="button"]');
      if (!control) return;
      const label = (control.getAttribute('aria-label') || control.textContent || '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      const knownAction = label.match(/sign in|sign out|save|join|leave|cancel|delete|approve|decline|invite|remove|edit|record|download|upload|accept|refresh|search|admin|host|profile|session/);
      if (knownAction) recordIssueBreadcrumb(`clicked ${knownAction[0]}`);
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
      document.removeEventListener('click', onClick, true);
    };
  }, [pathname]);

  return null;
}
