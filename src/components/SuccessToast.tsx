'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

const TOAST_DURATION = 4500;

type Toast = { id: number; message: string };
type ToastContextValue = { showSuccess: (message: string) => void };

const ToastContext = createContext<ToastContextValue | null>(null);

export function SuccessToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const nextId = useRef(0);

  const showSuccess = useCallback((message: string) => {
    nextId.current += 1;
    setToast({ id: nextId.current, message });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => {
      setToast((current) => current?.id === toast.id ? null : current);
    }, TOAST_DURATION);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  return (
    <ToastContext.Provider value={{ showSuccess }}>
      {children}
      {toast ? (
        <aside
          key={toast.id}
          aria-live="polite"
          aria-atomic="true"
          className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+4.5rem)] z-[90] mx-auto flex max-w-2xl items-center gap-3 overflow-hidden rounded-lg border border-moss/30 bg-card px-4 py-3 text-ink shadow-lg sm:top-[calc(env(safe-area-inset-top)+5rem)]"
        >
          <p role="status" className="min-w-0 flex-1 text-sm text-moss">{toast.message}</p>
          <button
            type="button"
            aria-label="Dismiss confirmation"
            onClick={() => setToast(null)}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted hover:bg-sand"
          >
            ×
          </button>
          <span
            aria-hidden="true"
            className="success-toast-progress absolute inset-x-0 bottom-0 h-1 origin-left bg-moss"
            style={{ animationDuration: `${TOAST_DURATION}ms` }}
          />
        </aside>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useSuccessToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useSuccessToast must be used within SuccessToastProvider.');
  return context;
}
