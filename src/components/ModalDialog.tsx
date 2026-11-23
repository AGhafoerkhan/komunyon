'use client';

import { useEffect, useRef, type ComponentPropsWithoutRef } from 'react';

type ModalDialogProps = Pick<ComponentPropsWithoutRef<'dialog'>,
  'aria-label' | 'aria-labelledby' | 'aria-describedby' | 'className' | 'children'> & {
  onDismiss: () => void;
  dismissible?: boolean;
  dismissOnBackdrop?: boolean;
};

export function ModalDialog({
  onDismiss,
  dismissible = true,
  dismissOnBackdrop = false,
  ...props
}: ModalDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const returnFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';

    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (document.activeElement === document.body && returnFocus instanceof HTMLElement && returnFocus.isConnected) {
        returnFocus.focus({ preventScroll: true });
      }
    };
  }, []);

  return (
    <dialog
      {...props}
      ref={dialogRef}
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault();
        if (dismissible) onDismiss();
      }}
      onClick={(event) => {
        if (dismissible && dismissOnBackdrop && event.target === event.currentTarget) onDismiss();
      }}
    />
  );
}
