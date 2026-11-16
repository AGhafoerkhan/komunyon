'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { PhotoLightbox } from '@/components/PhotoLightbox';
import { actionError } from '@/lib/errors';
import { formatDdMmYyyy, pastSessions } from '@/lib/format';
import { deleteSessionPhoto, listSessionPhotos, uploadSessionPhoto, type SessionPhoto } from '@/lib/photos';
import type { BibleStudy } from '@/types';

export function SessionPhotos({ study, isHost }: { study: BibleStudy; isHost: boolean }) {
  const { user } = useAuth();
  const dates = pastSessions(study);
  const [date, setDate] = useState(dates[0] ?? '');
  const [photos, setPhotos] = useState<SessionPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<SessionPhoto | null>(null);

  useEffect(() => {
    if (!date) return;
    let active = true;
    setLoading(true);
    setError(null);
    void listSessionPhotos(study.id, date)
      .then((next) => {
        if (active) setPhotos(next);
      })
      .catch((failure: unknown) => {
        if (active) setError(actionError(failure));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [date, study.id]);

  if (!user) return null;

  async function addPhoto(file: File) {
    if (!user || !date) return;
    setBusy(true);
    setError(null);
    try {
      await uploadSessionPhoto(study.id, date, user.uid, file);
      setPhotos(await listSessionPhotos(study.id, date));
    } catch (failure) {
      setError(actionError(failure));
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto(photo: SessionPhoto) {
    setBusy(true);
    setError(null);
    try {
      await deleteSessionPhoto(photo.path);
      setPhotos((current) => current.filter((item) => item.path !== photo.path));
      if (open?.path === photo.path) setOpen(null);
    } catch (failure) {
      setError(actionError(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-line bg-card p-4">
      <h2 className="font-serif text-xl">Session photos</h2>
      {dates.length === 0 ? (
        <p className="mt-1 text-sm text-muted">Photos can be added after a session has happened.</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted">Pictures from a gathering that has already happened.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {dates.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={item === date}
                onClick={() => setDate(item)}
                className={`rounded-md border px-2.5 py-1.5 text-sm ${
                  item === date ? 'border-canal bg-canal/5 text-ink' : 'border-line text-muted hover:bg-sand'
                }`}
              >
                {formatDdMmYyyy(item)}
              </button>
            ))}
          </div>
          {loading ? <p className="mt-4 text-sm text-muted">Loading photos…</p> : null}
          {photos.length > 0 ? (
            <ul className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {photos.map((photo) => {
                const canRemove = isHost || photo.ownerId === user.uid;
                return (
                  <li key={photo.path} className="relative">
                    <button type="button" onClick={() => setOpen(photo)} className="block w-full" aria-label="View session photo">
                      {/* Download URLs are tokenized and are not a fixed remote pattern. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo.url} alt="" className="aspect-square w-full rounded-md object-cover" />
                    </button>
                    {canRemove ? (
                      <button
                        type="button"
                        onClick={() => void removePhoto(photo)}
                        disabled={busy}
                        aria-label="Remove photo"
                        className="absolute top-1 right-1 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white"
                      >
                        ×
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : loading ? null : (
            <p className="mt-4 text-sm text-muted">No photos for this session yet.</p>
          )}
          <label className="mt-4 inline-flex h-10 cursor-pointer items-center justify-center rounded-md bg-canal px-3.5 text-sm font-medium text-white hover:bg-canal-dark">
            {busy ? 'Saving…' : 'Add a photo'}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void addPhoto(file);
              }}
            />
          </label>
        </>
      )}
      {error ? <p className="mt-3 text-sm text-clay">{error}</p> : null}
      {open ? <PhotoLightbox src={open.url} name={formatDdMmYyyy(date)} onClose={() => setOpen(null)} /> : null}
    </section>
  );
}
