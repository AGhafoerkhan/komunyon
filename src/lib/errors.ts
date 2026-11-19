export function firebaseErrorCode(error: unknown): string | null {
  return hasCode(error) ? error.code : null;
}

function hasCode(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string';
}

export function actionError(error: unknown): string {
  logActionError(error);
  if (hasCode(error)) {
    switch (error.code) {
      case 'permission-denied':
      case 'firestore/permission-denied':
        return 'You do not have permission to do that. Deploy firestore.rules and try again.';
      case 'auth/popup-closed-by-user':
      case 'auth/cancelled-popup-request':
      case 'auth/user-cancelled':
        return 'Sign-in was cancelled.';
      case 'auth/user-mismatch':
      case 'auth/credential-already-in-use':
        return 'Use the same Google account to confirm deletion.';
      case 'auth/requires-recent-login':
        return 'Confirm Google again, then the account can be deleted.';
      case 'auth/popup-blocked':
        return 'The browser blocked the Google window. Allow popups for this site and try again.';
      case 'auth/unauthorized-domain':
        return 'This domain is not authorized in Firebase Authentication.';
      case 'auth/operation-not-allowed':
        return 'Google sign-in is not enabled in the Firebase console.';
      case 'auth/invalid-api-key':
      case 'auth/api-key-not-valid.-please-pass-a-valid-api-key.':
        return 'The Firebase API key is invalid. Check .env.local.';
      case 'auth/network-request-failed':
        return 'Network error. Check your connection and try again.';
      case 'storage/unauthorized':
        return 'That file was denied. Deploy storage.rules and try again.';
      case 'storage/unauthenticated':
        return 'Sign in again before uploading a file.';
      case 'storage/unknown':
      case 'storage/retry-limit-exceeded':
      case 'storage/bucket-not-found':
        return 'Photo storage is not set up yet. In Firebase, open Storage and click Get Started, then try again.';
      case 'firestore/failed-precondition':
        return 'Firestore is not created for this project yet.';
      default:
        return error.code.startsWith('firestore/')
          ? `The database rejected that request (${error.code}).`
          : 'Something went wrong. Please try again.';
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Please try again.';
}

function logActionError(error: unknown): void {
  if (typeof console === 'undefined') return;
  if (hasCode(error)) {
    console.error('[Komunyon] Firebase action failed', {
      code: error.code,
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : undefined,
      stack: error instanceof Error ? error.stack : undefined,
      rawError: error,
    });
    return;
  }
  console.error('[Komunyon] Action failed', {
    message: error instanceof Error ? error.message : String(error),
    name: error instanceof Error ? error.name : undefined,
    stack: error instanceof Error ? error.stack : undefined,
    rawError: error,
  });
}
