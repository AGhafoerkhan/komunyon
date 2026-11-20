'use client';

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
export { clientDraftKey, clearClientDrafts } from '@/lib/clientDrafts';

const DRAFT_SCHEMA = 1;
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type DraftStatus = 'clean' | 'loading' | 'saving' | 'saved' | 'restored' | 'stale' | 'unavailable';

type StoredDraft<T> = {
  schema: number;
  savedAt: number;
  sourceVersion: string | null;
  value: T;
};

export function useClientDraft<T>({
  storageKey,
  initialValue,
  value,
  setValue,
  sourceVersion = null,
  enabled = true,
}: {
  storageKey: string;
  initialValue: T;
  value: T;
  setValue: Dispatch<SetStateAction<T>>;
  sourceVersion?: string | null;
  enabled?: boolean;
}) {
  const [status, setStatus] = useState<DraftStatus>('loading');
  const [ready, setReady] = useState(false);
  const baseline = useRef(initialValue);
  const valueRef = useRef(value);
  const setterRef = useRef(setValue);
  const sourceRef = useRef(sourceVersion);
  const skipRestoreWrite = useRef<string | null>(null);
  const timer = useRef<number | null>(null);

  valueRef.current = value;
  setterRef.current = setValue;
  sourceRef.current = sourceVersion;

  useEffect(() => {
    if (!enabled) {
      setReady(false);
      return;
    }
    setReady(false);
    setStatus('loading');
    baseline.current = initialValue;
    try {
      const raw = window.sessionStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as StoredDraft<T>;
        const expired = Date.now() - saved.savedAt > DRAFT_TTL_MS;
        if (saved.schema !== DRAFT_SCHEMA || expired) {
          window.sessionStorage.removeItem(storageKey);
        } else if (saved.sourceVersion !== sourceVersion) {
          window.sessionStorage.removeItem(storageKey);
          setStatus('stale');
        } else {
          const serialized = JSON.stringify(saved.value);
          skipRestoreWrite.current = serialized;
          setterRef.current(saved.value);
          setStatus('restored');
        }
      } else {
        setStatus('clean');
      }
    } catch {
      try { window.sessionStorage.removeItem(storageKey); } catch { /* Storage is disabled. */ }
      setStatus('clean');
    }
    setReady(true);
  }, [enabled, initialValue, sourceVersion, storageKey]);

  const persist = useCallback((next: T): boolean => {
    if (JSON.stringify(next) === JSON.stringify(baseline.current)) return true;
    const draft: StoredDraft<T> = {
      schema: DRAFT_SCHEMA,
      savedAt: Date.now(),
      sourceVersion: sourceRef.current,
      value: next,
    };
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(draft));
      return true;
    } catch {
      // Storage can be disabled or full; the form itself remains usable.
      return false;
    }
  }, [storageKey]);

  useEffect(() => {
    if (!ready) return;
    const serialized = JSON.stringify(value);
    if (serialized === skipRestoreWrite.current) {
      skipRestoreWrite.current = null;
      return;
    }
    if (skipRestoreWrite.current !== null) return;
    if (serialized === JSON.stringify(baseline.current)) {
      setStatus((current) => current === 'stale' ? current : 'clean');
      return;
    }

    setStatus('saving');
    timer.current = window.setTimeout(() => {
      setStatus(persist(valueRef.current) ? 'saved' : 'unavailable');
      timer.current = null;
    }, 450);

    return () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [persist, ready, value]);

  useEffect(() => {
    if (!ready || (status !== 'saving' && status !== 'unavailable')) return;
    const flushDraft = () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
      const stored = persist(valueRef.current);
      setStatus(stored ? 'saved' : 'unavailable');
      return stored;
    };
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (flushDraft()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    const persistBeforeHide = () => { flushDraft(); };
    const persistBeforeNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target;
      if (target instanceof Element && target.closest('a[href]')) flushDraft();
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    window.addEventListener('pagehide', persistBeforeHide);
    document.addEventListener('click', persistBeforeNavigation, true);
    return () => {
      window.removeEventListener('beforeunload', warnBeforeUnload);
      window.removeEventListener('pagehide', persistBeforeHide);
      document.removeEventListener('click', persistBeforeNavigation, true);
    };
  }, [persist, ready, status]);

  const markSaved = useCallback((savedValue: T = valueRef.current) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    baseline.current = savedValue;
    valueRef.current = savedValue;
    try { window.sessionStorage.removeItem(storageKey); } catch { /* Storage is disabled. */ }
    setStatus('clean');
  }, [storageKey]);

  const discardDraft = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    try { window.sessionStorage.removeItem(storageKey); } catch { /* Storage is disabled. */ }
    setterRef.current(baseline.current);
    skipRestoreWrite.current = null;
    setStatus('clean');
  }, [storageKey]);

  return { status, ready, markSaved, discardDraft };
}

export function ClientDraftStatus({
  status,
  onDiscard,
}: {
  status: DraftStatus;
  onDiscard: () => void;
}) {
  if (status === 'clean' || status === 'loading') return null;

  const message = status === 'saving'
    ? 'Saving draft on this device…'
    : status === 'stale'
      ? 'An older draft was cleared because the saved data changed.'
      : status === 'restored'
        ? 'Draft restored from this device · Not published'
        : status === 'unavailable'
          ? 'Draft could not be saved here. Save your changes before leaving.'
          : 'Draft saved on this device · Not published';

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-sand/50 px-3 py-2 text-xs text-muted" role="status" aria-live="polite">
      <span>{message}</span>
      {status !== 'saving' ? (
        <button type="button" onClick={onDiscard} className="shrink-0 font-medium text-canal underline underline-offset-2">
          {status === 'stale' ? 'Dismiss' : 'Discard draft'}
        </button>
      ) : null}
    </div>
  );
}
