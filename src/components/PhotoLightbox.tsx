'use client';

import { useEffect } from 'react';

export function canShowPhoto(src: string): boolean {
  return src.startsWith('https://') || src.startsWith('data:image/jpeg;base64,');
}

export function PhotoLightbox({ src, name, onClose }: { src: string; name: string; onClose: () => void }) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/80" role="dialog" aria-modal="true" aria-label={name}>
      <div className="flex h-dvh w-screen flex-col">
        <div className="flex justify-end px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pr-[max(0.75rem,env(safe-area-inset-right))]">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close photo"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-white hover:bg-white/15"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <figure className="flex max-h-full min-h-0 w-full flex-col items-center gap-3">
            {/* Profile photos are account URLs or small JPEGs stored on the user document. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={name} className="max-h-[75dvh] max-w-full object-contain" />
            <figcaption className="max-w-full truncate text-center text-sm text-white">{name}</figcaption>
          </figure>
        </div>
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path d="M5 5l12 12M17 5 5 17" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}
