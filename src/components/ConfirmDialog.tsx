'use client';

import { useId } from 'react';
import { ModalDialog } from '@/components/ModalDialog';
import { Alert, Button, Spinner } from '@/components/ui';

type DialogButtonVariant = 'primary' | 'secondary' | 'danger';

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  busy,
  error,
  onConfirm,
  onClose,
  cancelVariant = 'secondary',
  confirmVariant = 'danger',
}: {
  title: string;
  body: string;
  confirmLabel: string;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
  cancelVariant?: DialogButtonVariant;
  confirmVariant?: DialogButtonVariant;
}) {
  const titleId = useId();
  const bodyId = useId();

  return (
    <ModalDialog
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onDismiss={onClose}
      dismissible={!busy}
      dismissOnBackdrop
      className="fixed inset-0 m-auto max-h-[min(32rem,calc(100dvh-2rem))] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-lg border border-line bg-card text-ink shadow-lg backdrop:bg-black/50"
    >
      <div className="p-5">
        <h2 id={titleId} className="font-serif text-2xl leading-tight break-words">
          {title}
        </h2>
        <p id={bodyId} className="mt-2 text-sm leading-relaxed break-words text-muted">{body}</p>
        {error ? (
          <div className="mt-4">
            <Alert>{error}</Alert>
          </div>
        ) : null}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant={cancelVariant} className="w-full sm:w-auto" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={confirmVariant} className="w-full sm:w-auto" onClick={onConfirm} disabled={busy}>
            {busy ? <Spinner /> : null}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </ModalDialog>
  );
}
