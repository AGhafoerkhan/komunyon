'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PhotoLightbox } from '@/components/PhotoLightbox';
import { fieldClass } from '@/components/ui';
import { actionError } from '@/lib/errors';
import { getFirebase } from '@/lib/firebase';
import { formatDdMmYyyy } from '@/lib/format';
import { LIMITS } from '@/lib/limits';
import { deleteSessionFile, downloadSessionFile, listSessionFiles, uploadSessionFile, type SessionFile } from '@/lib/photos';
import { describeDebugError } from '@/lib/sessionDebug';
import { loadSessionDescription, saveSessionDescription } from '@/lib/sessions';

const cardGrid = 'mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4';

export function SessionRecord({
  studyId,
  date,
  isHost,
  hostId,
  onDebug,
}: {
  studyId: string;
  date: string;
  isHost: boolean;
  hostId: string;
  onDebug: (title: string, detail?: unknown) => void;
}) {
  const { user } = useAuth();
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<SessionFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<SessionFile | null>(null);
  const [pendingRemove, setPendingRemove] = useState<SessionFile | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const { auth, storage } = getFirebase();
    const options = storage.app.options;
    onDebug('storage client', {
      projectId: options.projectId ?? '',
      authDomain: options.authDomain ?? '',
      storageBucket: options.storageBucket ?? '',
      appId: options.appId ?? '',
      reactUid: user?.uid ?? null,
      authUid: auth.currentUser?.uid ?? null,
      authEmail: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      hostId,
      isHost,
      uidMatchesHost: auth.currentUser?.uid === hostId,
      providers: auth.currentUser?.providerData.map((item) => ({
        providerId: item.providerId,
        uid: item.uid,
      })),
      folder: `sessions/${studyId}/${date}`,
    });
    void auth.currentUser
      ?.getIdTokenResult()
      .then((result) => {
        if (!active) return;
        onDebug('auth session', {
          signInProvider: result.signInProvider,
          authTime: result.authTime,
          issuedAtTime: result.issuedAtTime,
          expirationTime: result.expirationTime,
          claims: result.claims,
        });
      })
      .catch((failure: unknown) => {
        if (active) onDebug('auth session failed', describeDebugError(failure));
      });
    void loadSessionDescription(studyId, date)
      .then((text) => {
        if (!active) return;
        setDescription(text);
        onDebug('description loaded', { characters: text.length });
      })
      .catch((failure: unknown) => {
        if (!active) return;
        setError(actionError(failure));
        onDebug('description failed', describeDebugError(failure));
      });
    void listSessionFiles(studyId, date)
      .then((next) => {
        if (!active) return;
        setFiles(next);
        onDebug(
          'files listed',
          next.map((file) => ({ name: file.name, kind: file.kind, path: file.path })),
        );
      })
      .catch((failure: unknown) => {
        if (!active) return;
        setError(actionError(failure));
        onDebug('files list failed', describeDebugError(failure));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [studyId, date, hostId, isHost, onDebug, user?.uid]);

  if (!user) return null;
  const uid = user.uid;

  const images = files.filter((file) => file.kind === 'image');
  const recordings = files.filter((file) => file.kind === 'audio');
  const texts = files.filter((file) => file.kind === 'text');

  async function saveDescription() {
    if (!isHost) return;
    setBusy(true);
    setError(null);
    onDebug('save description', { characters: description.trim().length });
    try {
      await saveSessionDescription(studyId, date, description);
      setDescription(description.trim());
      onDebug('description saved', { characters: description.trim().length });
    } catch (failure) {
      setError(actionError(failure));
      onDebug('description save failed', describeDebugError(failure));
    } finally {
      setBusy(false);
    }
  }

  async function addFile(file: File) {
    if (!isHost) return;
    setBusy(true);
    setError(null);
    onDebug('upload start', {
      name: file.name,
      type: file.type || '(empty)',
      bytes: file.size,
      lastModified: file.lastModified,
      folder: `sessions/${studyId}/${date}`,
      uid,
    });
    try {
      await uploadSessionFile(studyId, date, uid, file);
      const next = await listSessionFiles(studyId, date);
      setFiles(next);
      onDebug(
        'upload finished',
        next.map((item) => ({ name: item.name, kind: item.kind, path: item.path })),
      );
    } catch (failure) {
      setError(actionError(failure));
      onDebug('upload failed', describeDebugError(failure));
    } finally {
      setBusy(false);
    }
  }

  async function removeFile(file: SessionFile) {
    if (!isHost) return;
    setBusy(true);
    setError(null);
    onDebug('remove start', { path: file.path, kind: file.kind });
    try {
      await deleteSessionFile(file.path);
      setFiles((current) => current.filter((item) => item.path !== file.path));
      if (open?.path === file.path) setOpen(null);
      setPendingRemove(null);
      onDebug('remove finished', { path: file.path });
    } catch (failure) {
      setError(actionError(failure));
      onDebug('remove failed', describeDebugError(failure));
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
        <h2 className="font-serif text-2xl">Files</h2>
        {images.length > 0 ? (
          <ul className={cardGrid}>
            {images.map((file) => (
              <li key={file.path} className="relative min-w-0 rounded-lg border border-line bg-card p-2">
                <div className="absolute right-2 top-2 z-10 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void download(file)}
                    className="h-7 rounded-full bg-card px-2 text-xs text-canal"
                  >
                    Download
                  </button>
                  {isHost ? <RemoveButton busy={busy} floating={false} onClick={() => setPendingRemove(file)} /> : null}
                </div>
                <button type="button" onClick={() => setOpen(file)} className="block w-full" aria-label="View session photo">
                  {/* Download URLs are tokenized and are not a fixed remote pattern. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={file.url} alt="" className="aspect-square w-full rounded-md object-cover" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {recordings.length > 0 ? (
          <ul className={cardGrid}>
            {recordings.map((file) => (
              <li key={file.path} className="relative flex min-h-28 min-w-0 flex-col justify-between rounded-lg border border-line bg-card p-3">
                {isHost ? <RemoveButton busy={busy} onClick={() => setPendingRemove(file)} /> : null}
                <div className="min-w-0 pr-6">
                  <p className="text-sm font-medium text-ink">Recording</p>
                  <RecordingPlayer src={file.url} />
                </div>
                <FileActions file={file} onDownload={download} />
              </li>
            ))}
          </ul>
        ) : null}
        {texts.length > 0 ? (
          <ul className={cardGrid}>
            {texts.map((file) => (
              <li key={file.path} className="relative flex min-h-28 min-w-0 flex-col justify-between rounded-lg border border-line bg-card p-3">
                {isHost ? <RemoveButton busy={busy} onClick={() => setPendingRemove(file)} /> : null}
                <p className="pr-6 text-sm font-medium text-ink">Text file</p>
                <FileActions file={file} onDownload={download} />
              </li>
            ))}
          </ul>
        ) : null}
        {!loading && files.length === 0 ? <p className="mt-3 text-sm text-muted">No files for this session yet.</p> : null}
        {isHost ? (
          <div className="mt-4">
            <FileButton
              label={busy ? 'Saving…' : 'Add a file'}
              accept="image/*,audio/*,.txt,.m4a,.mp3,.wav,.ogg,.webm,text/plain"
              disabled={busy}
              onFile={addFile}
            />
          </div>
        ) : null}
      </div>
      {error ? <p className="mt-3 text-sm text-clay">{error}</p> : null}
      {open ? <PhotoLightbox src={open.url} name={formatDdMmYyyy(date)} onClose={() => setOpen(null)} /> : null}
      {pendingRemove ? (
        <ConfirmDialog
          title="Are you sure?"
          body="This file will be removed from the session."
          confirmLabel="Remove"
          busy={busy}
          error={error}
          onConfirm={() => void removeFile(pendingRemove)}
          onClose={() => {
            if (!busy) {
              setPendingRemove(null);
              setError(null);
            }
          }}
        />
      ) : null}
    </section>
  );
}

function RecordingPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  }

  return (
    <div className="mt-2 flex min-w-0 items-center gap-2">
      <audio
        ref={audioRef}
        src={src}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
        }}
        onTimeUpdate={() => {
          const audio = audioRef.current;
          if (audio) setProgress(audio.currentTime);
        }}
        onLoadedMetadata={() => {
          const audio = audioRef.current;
          if (audio && Number.isFinite(audio.duration)) setDuration(audio.duration);
        }}
      />
      <button type="button" onClick={toggle} aria-label={playing ? 'Pause recording' : 'Play recording'} className="shrink-0 text-sm text-canal">
        {playing ? 'Pause' : 'Play'}
      </button>
      <input
        type="range"
        min={0}
        max={duration || 0}
        step={0.1}
        value={Math.min(progress, duration || 0)}
        aria-label="Recording position"
        className="min-w-0 flex-1 accent-canal"
        onChange={(event) => {
          const audio = audioRef.current;
          const next = Number(event.target.value);
          if (audio) audio.currentTime = next;
          setProgress(next);
        }}
      />
    </div>
  );
}

function RemoveButton({ busy, onClick, floating = true }: { busy: boolean; onClick: () => void; floating?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label="Remove"
      className={`${floating ? 'absolute right-2 top-2 z-10' : ''} flex h-7 w-7 items-center justify-center rounded-full bg-card text-sm leading-none text-clay disabled:opacity-50`}
    >
      X
    </button>
  );
}

function FileActions({ file, onDownload }: { file: SessionFile; onDownload: (file: SessionFile) => void }) {
  return (
    <div className="mt-2">
      <button type="button" onClick={() => void onDownload(file)} className="text-sm text-canal">
        Download
      </button>
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
