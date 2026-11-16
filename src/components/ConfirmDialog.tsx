'use client';

import { useEffect, useId, useRef } from 'react';
import { Alert, Button, Spinner } from '@/components/ui';

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onClose();
    }
    window.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [busy, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-ink/40"
        aria-label="Close"
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative max-h-[min(32rem,calc(100dvh-2rem))] w-full max-w-md overflow-y-auto rounded-lg border border-line bg-card p-5 shadow-lg outline-none"
      >
        <h2 id={titleId} className="font-serif text-2xl leading-tight break-words">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed break-words text-muted">{body}</p>
        {error ? (
          <div className="mt-4">
            <Alert>{error}</Alert>
          </div>
        ) : null}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" className="w-full sm:w-auto" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" className="w-full sm:w-auto" onClick={onConfirm} disabled={busy}>
            {busy ? <Spinner /> : null}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
