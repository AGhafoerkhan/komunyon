'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { PhotoLightbox } from '@/components/PhotoLightbox';
import { actionError } from '@/lib/errors';
import { formatDdMmYyyy, pastSessions } from '@/lib/format';
import { deleteSessionPhoto, downloadSessionPhoto, listSessionPhotos, uploadSessionPhoto, type SessionPhoto } from '@/lib/photos';
import type { BibleStudy } from '@/types';

export function SessionPhotos({ study, isHost }: { study: BibleStudy; isHost: boolean }) {
  const { user } = useAuth();
  const dates = pastSessions(study);
  const [date, setDate] = useState<string | null>(null);
  const [photos, setPhotos] = useState<SessionPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<SessionPhoto | null>(null);

  useEffect(() => {
    if (!date) return;
    let active = true;
    setLoading(true);
    setPhotos([]);
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
    if (!user || !date || !isHost) return;
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
    if (!isHost) return;
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

  async function download(photo: SessionPhoto) {
    if (!date) return;
    setError(null);
    try {
      await downloadSessionPhoto(photo, date);
    } catch (failure) {
      setError(actionError(failure));
    }
  }

  return (
    <section>
      {dates.length === 0 ? (
        <p className="text-sm text-muted">Photos can be added after a session has happened.</p>
      ) : (
        <>
          <p className="text-sm text-muted">Open a date to load its photos.</p>
          <ul className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {dates.map((item) => (
              <li key={item}>
                <button
                  type="button"
                  aria-pressed={item === date}
                  onClick={() => setDate(item)}
                  className={`flex h-full min-h-28 w-full items-end rounded-lg border p-4 text-left ${
                    item === date ? 'border-canal bg-card text-ink' : 'border-line bg-card text-muted hover:bg-sand'
                  }`}
                >
                  <span className="text-sm font-medium">{formatDdMmYyyy(item)}</span>
                </button>
              </li>
            ))}
          </ul>
          {date ? (
            <div className="mt-6">
              <h2 className="font-serif text-2xl">{formatDdMmYyyy(date)}</h2>
              {loading ? <p className="mt-3 text-sm text-muted">Loading photos…</p> : null}
              {photos.length > 0 ? (
                <ul className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {photos.map((photo) => (
                    <li key={photo.path} className="rounded-lg border border-line bg-card p-2">
                      <button type="button" onClick={() => setOpen(photo)} className="block w-full" aria-label="View session photo">
                        {/* Download URLs are tokenized and are not a fixed remote pattern. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photo.url} alt="" className="aspect-square w-full rounded-md object-cover" />
                      </button>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button type="button" onClick={() => void download(photo)} className="text-sm text-canal">
                          Download
                        </button>
                        {isHost ? (
                          <button
                            type="button"
                            onClick={() => void removePhoto(photo)}
                            disabled={busy}
                            className="text-sm text-clay disabled:opacity-50"
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : loading ? null : (
                <p className="mt-3 text-sm text-muted">No photos for this session yet.</p>
              )}
              {isHost ? (
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
              ) : null}
            </div>
          ) : null}
        </>
      )}
      {error ? <p className="mt-3 text-sm text-clay">{error}</p> : null}
      {open && date ? <PhotoLightbox src={open.url} name={formatDdMmYyyy(date)} onClose={() => setOpen(null)} /> : null}
    </section>
  );
}
