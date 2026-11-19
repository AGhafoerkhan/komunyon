'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { captureClientIssue } from '@/lib/issueReports';

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
    console.info('[Komunyon][Page] loaded', {
      pathname,
      at: new Date().toISOString(),
    });

    const onError = (event: ErrorEvent) => {
      captureClientIssue(event.error ?? event.message);
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
      captureClientIssue(event.reason);
      console.error('[Komunyon][Page] unhandled promise rejection', {
        pathname,
        at: new Date().toISOString(),
        ...errorDetails(event.reason),
      });
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, [pathname]);

  return null;
}
