'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { PhotoLightbox } from '@/components/PhotoLightbox';
import { fieldClass } from '@/components/ui';
import { actionError } from '@/lib/errors';
import { formatDdMmYyyy } from '@/lib/format';
import { LIMITS } from '@/lib/limits';
import { deleteSessionFile, downloadSessionFile, listSessionFiles, uploadSessionFile, type SessionFile } from '@/lib/photos';
import { loadSessionDescription, saveSessionDescription } from '@/lib/sessions';

const cardGrid = 'mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4';

export function SessionRecord({ studyId, date, isHost }: { studyId: string; date: string; isHost: boolean }) {
  const { user } = useAuth();
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<SessionFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<SessionFile | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void Promise.all([loadSessionDescription(studyId, date), listSessionFiles(studyId, date)])
      .then(([text, next]) => {
        if (!active) return;
        setDescription(text);
        setFiles(next);
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
  }, [studyId, date]);

  if (!user) return null;
  const uid = user.uid;

  const images = files.filter((file) => file.kind === 'image');
  const attachments = files.filter((file) => file.kind !== 'image');

  async function saveDescription() {
    if (!isHost) return;
    setBusy(true);
    setError(null);
    try {
      await saveSessionDescription(studyId, date, description);
      setDescription(description.trim());
    } catch (failure) {
      setError(actionError(failure));
    } finally {
      setBusy(false);
    }
  }

  async function addFile(file: File) {
    if (!isHost) return;
    setBusy(true);
    setError(null);
    try {
      await uploadSessionFile(studyId, date, uid, file);
      setFiles(await listSessionFiles(studyId, date));
    } catch (failure) {
      setError(actionError(failure));
    } finally {
      setBusy(false);
    }
  }

  async function removeFile(file: SessionFile) {
    if (!isHost) return;
    setBusy(true);
    setError(null);
    try {
      await deleteSessionFile(file.path);
      setFiles((current) => current.filter((item) => item.path !== file.path));
      if (open?.path === file.path) setOpen(null);
    } catch (failure) {
      setError(actionError(failure));
    } finally {
      setBusy(false);
    }
  }

  async function download(file: SessionFile) {
    setError(null);
    try {
      await downloadSessionFile(file, date);
    } catch (failure) {
      setError(actionError(failure));
    }
  }

  return (
    <section>
      {loading ? <p className="text-sm text-muted">Loading this session…</p> : null}
      <div className="mt-4">
        <h2 className="font-serif text-2xl">Description</h2>
        {isHost ? (
          <>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={LIMITS.sessionDescriptionMax}
              rows={5}
              placeholder="What happened in this session?"
              className={`${fieldClass} mt-3`}
            />
            <button
              type="button"
              onClick={() => void saveDescription()}
              disabled={busy}
              className="mt-3 inline-flex h-10 items-center justify-center rounded-md bg-canal px-3.5 text-sm font-medium text-white hover:bg-canal-dark disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save description'}
            </button>
          </>
        ) : (
          <p className="mt-3 whitespace-pre-wrap text-sm text-ink">
            {description || 'No description for this session yet.'}
          </p>
        )}
      </div>

      <div className="mt-8">
        <h2 className="font-serif text-2xl">Photos and files</h2>
        {images.length > 0 ? (
          <ul className={cardGrid}>
            {images.map((file) => (
              <li key={file.path} className="rounded-lg border border-line bg-card p-2">
                <button type="button" onClick={() => setOpen(file)} className="block w-full" aria-label="View session photo">
                  {/* Download URLs are tokenized and are not a fixed remote pattern. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={file.url} alt="" className="aspect-square w-full rounded-md object-cover" />
                </button>
                <FileActions file={file} busy={busy} isHost={isHost} onDownload={download} onRemove={removeFile} />
              </li>
            ))}
          </ul>
        ) : null}
        {attachments.length > 0 ? (
          <ul className={cardGrid}>
            {attachments.map((file) => (
              <li key={file.path} className="flex min-h-28 flex-col justify-between rounded-lg border border-line bg-card p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{file.kind === 'audio' ? 'Recording' : 'Text file'}</p>
                  {file.kind === 'audio' ? <audio controls src={file.url} className="mt-2 w-full" preload="none" /> : null}
                </div>
                <FileActions file={file} busy={busy} isHost={isHost} onDownload={download} onRemove={removeFile} />
              </li>
            ))}
          </ul>
        ) : null}
        {!loading && images.length === 0 && attachments.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No photos or files for this session yet.</p>
        ) : null}
        {isHost ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <FileButton label={busy ? 'Saving…' : 'Add a photo'} accept="image/*" disabled={busy} onFile={addFile} />
            <FileButton
              label={busy ? 'Saving…' : 'Add a recording'}
              accept="audio/*,.m4a,.mp3,.wav,.ogg,.webm"
              disabled={busy}
              onFile={addFile}
            />
            <FileButton label={busy ? 'Saving…' : 'Add a text file'} accept=".txt,text/plain" disabled={busy} onFile={addFile} />
          </div>
        ) : null}
      </div>
      {error ? <p className="mt-3 text-sm text-clay">{error}</p> : null}
      {open ? <PhotoLightbox src={open.url} name={formatDdMmYyyy(date)} onClose={() => setOpen(null)} /> : null}
    </section>
  );
}

function FileActions({
  file,
  busy,
  isHost,
  onDownload,
  onRemove,
}: {
  file: SessionFile;
  busy: boolean;
  isHost: boolean;
  onDownload: (file: SessionFile) => void;
  onRemove: (file: SessionFile) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <button type="button" onClick={() => void onDownload(file)} className="text-sm text-canal">
        Download
      </button>
      {isHost ? (
        <button
          type="button"
          onClick={() => void onRemove(file)}
          disabled={busy}
          className="text-sm text-clay disabled:opacity-50"
        >
          Remove
        </button>
      ) : null}
    </div>
  );
}

function FileButton({
  label,
  accept,
  disabled,
  onFile,
}: {
  label: string;
  accept: string;
  disabled: boolean;
  onFile: (file: File) => void;
}) {
  return (
    <label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md bg-canal px-3.5 text-sm font-medium text-white hover:bg-canal-dark">
      {label}
      <input
        type="file"
        accept={accept}
        className="sr-only"
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) onFile(file);
        }}
      />
    </label>
  );
}
