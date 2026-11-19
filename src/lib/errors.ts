import { captureClientIssue } from '@/lib/issueReports';

export function firebaseErrorCode(error: unknown): string | null {
  return hasCode(error) ? error.code : null;
}

function hasCode(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string';
}

export function actionError(error: unknown): string {
  if (hasCode(error)) {
    switch (error.code) {
      case 'auth/popup-closed-by-user':
      case 'auth/cancelled-popup-request':
      case 'auth/user-cancelled':
        return 'Sign-in was cancelled.';
    }
  }
  captureClientIssue(error);
  return 'Something went wrong. Report a problem, contact support, or try again later.';
}

