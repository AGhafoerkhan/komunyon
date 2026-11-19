import { captureClientIssue, type IssueContext } from '@/lib/issueReports';

export const SIGN_IN_CANCELLED_MESSAGE = 'Sign-in was cancelled.';
export const OFFLINE_AUTH_MESSAGE = 'Connection lost. Check your internet and try again.';

export function firebaseErrorCode(error: unknown): string | null {
  return hasCode(error) ? error.code : null;
}

function hasCode(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string';
}

export function actionError(error: unknown, context?: IssueContext): string {
  if (hasCode(error)) {
    switch (error.code) {
      case 'auth/popup-closed-by-user':
      case 'auth/cancelled-popup-request':
      case 'auth/user-cancelled':
        return SIGN_IN_CANCELLED_MESSAGE;
      case 'auth/network-request-failed':
        if (typeof navigator !== 'undefined' && !navigator.onLine) return OFFLINE_AUTH_MESSAGE;
    }
  }
  captureClientIssue(error, context ?? {
    action: 'handled application operation',
    operation: 'error caught and passed to actionError',
  });
  return 'Something went wrong. Contact support or try again later.';
}

