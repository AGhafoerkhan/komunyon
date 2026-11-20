const DRAFT_PREFIX = 'komunyon:form-draft:v1:';

export function clientDraftKey(uid: string, formId: string): string {
  return `${DRAFT_PREFIX}${uid}:${formId}`;
}

export function clearClientDrafts(uid: string): void {
  if (typeof window === 'undefined') return;
  const prefix = `${DRAFT_PREFIX}${uid}:`;
  try {
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith(prefix)) window.sessionStorage.removeItem(key);
    }
  } catch {
    // Storage can be disabled by the browser.
  }
}
