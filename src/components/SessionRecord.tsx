'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PhotoLightbox } from '@/components/PhotoLightbox';
import { fieldClass } from '@/components/ui';
import { actionError } from '@/lib/errors';
import { formatDdMmYyyy } from '@/lib/format';
import { LIMITS } from '@/lib/limits';
import { deleteSessionFile, downloadSessionFile, listSessionFiles, uploadSessionFile, type SessionFile } from '@/lib/photos';
import { loadSessionDescription, saveSessionDescription } from '@/lib/sessions';
import { useSuccessToast } from '@/components/SuccessToast';
import { ClientDraftStatus, useClientDraft } from '@/components/useClientDraft';
import { clientDraftKey } from '@/lib/clientDrafts';

const cardGrid = 'mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4';

export function SessionRecord({ studyId, date, isHost }: { studyId: string; date: string; isHost: boolean }) {
  const { user } = useAuth();
  const { showSuccess } = useSuccessToast();
  const [description, setDescription] = useState('');
  const [serverDescription, setServerDescription] = useState('');
  const [descriptionVersion, setDescriptionVersion] = useState<string | null>(null);
  const [descriptionLoaded, setDescriptionLoaded] = useState(false);
  const [files, setFiles] = useState<SessionFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<SessionFile | null>(null);
  const [pendingRemove, setPendingRemove] = useState<SessionFile | null>(null);
  const [pendingDownload, setPendingDownload] = useState<SessionFile | null>(null);
  const descriptionDraftKey = user ? clientDraftKey(user.uid, `session-description-${studyId}-${date}`) : 'komunyon:form-draft:session:anonymous';
  const { status: descriptionDraftStatus, markSaved: markDescriptionSaved, discardDraft: discardDescriptionDraft } = useClientDraft({
    storageKey: descriptionDraftKey,
    initialValue: serverDescription,
    value: description,
    setValue: setDescription,
    sourceVersion: descriptionVersion,
    enabled: descriptionLoaded,
  });

  useEffect(() => {
    let active = true;
    setLoading(true);
    setDescriptionLoaded(false);
    setError(null);
    void loadSessionDescription(studyId, date)
      .then((result) => {
        if (!active) return;
        setServerDescription(result.text);
        setDescription(result.text);
        setDescriptionVersion(result.updatedAt);
        setDescriptionLoaded(true);
      })
      .catch((failure: unknown) => {
        if (!active) return;
        setError(actionError(failure));
        setServerDescription('');
        setDescription('');
        setDescriptionVersion(null);
        setDescriptionLoaded(true);
      });
    void listSessionFiles(studyId, date)
      .then((next) => {
        if (active) setFiles(next);
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
  const recordings = files.filter((file) => file.kind === 'audio');
  const texts = files.filter((file) => file.kind === 'text');

  async function saveDescription() {
    if (!isHost) return;
    setBusy(true);
    setError(null);
    try {
      await saveSessionDescription(studyId, date, description);
      setDescription(description.trim());
      setServerDescription(description.trim());
      markDescriptionSaved(description.trim());
      showSuccess('Session description saved.');
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
      showSuccess('File added to this session.');
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
      setPendingRemove(null);
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
              aria-label="Session description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={LIMITS.sessionDescriptionMax}
              rows={5}
              placeholder="What happened in this session?"
              className={`${fieldClass} mt-3`}
            />
            <p className="mt-2 text-xs leading-relaxed text-muted">Description drafts are saved in this browser tab for up to 7 days. They are not visible to others until saved and are cleared after saving, signing out, or closing the tab.</p>
            <ClientDraftStatus status={descriptionDraftStatus} onDiscard={discardDescriptionDraft} />
            <button
              type="button"
              onClick={() => void saveDescription()}
              disabled={busy}
              className="mt-3 inline-flex h-10 items-center justify-center rounded-md bg-canal px-3.5 text-sm font-medium text-on-canal hover:bg-canal-dark disabled:opacity-50"
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
          <section className="mt-6">
            <h3 className="text-sm font-medium">Images</h3>
            <ul className={cardGrid}>
              {images.map((file) => (
                <li key={file.path} className="relative min-w-0 rounded-lg border border-line bg-card p-2">
                  <FileTools file={file} isHost={isHost} busy={busy} onDownload={(next) => setPendingDownload(next)} onRemove={() => setPendingRemove(file)} />
                  <button type="button" onClick={() => setOpen(file)} className="block w-full" aria-label="View session photo">
                    {/* Download URLs are tokenized and are not a fixed remote pattern. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={file.url} alt="" className="aspect-square w-full rounded-md object-cover" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {recordings.length > 0 ? (
          <section className="mt-6">
            <h3 className="text-sm font-medium">Recordings</h3>
            <ul className={cardGrid}>
              {recordings.map((file) => (
                <li key={file.path} className="relative flex min-h-28 min-w-0 flex-col rounded-lg border border-line bg-card p-3">
                  <FileTools file={file} isHost={isHost} busy={busy} onDownload={(next) => setPendingDownload(next)} onRemove={() => setPendingRemove(file)} />
                  <p title={fileTitle(file.label)} className="absolute top-3.5 left-3 max-w-[calc(100%-4.75rem)] truncate text-sm font-medium text-ink">
                    {fileTitle(file.label) || 'Recording'}
                  </p>
                  <div className="pt-7">
                    <RecordingPlayer src={file.url} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {texts.length > 0 ? (
          <section className="mt-6">
            <h3 className="text-sm font-medium">Transcripts</h3>
            <ul className={cardGrid}>
              {texts.map((file) => (
              <li key={file.path} className="relative min-h-28 min-w-0 rounded-lg border border-line bg-card p-3">
                  <FileTools file={file} isHost={isHost} busy={busy} onDownload={(next) => setPendingDownload(next)} onRemove={() => setPendingRemove(file)} />
                <p title={fileTitle(file.label)} className="absolute top-3.5 left-3 max-w-[calc(100%-4.75rem)] truncate text-sm font-medium text-ink">
                  {fileTitle(file.label) || 'Text file'}
                </p>
              </li>
              ))}
            </ul>
          </section>
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
      {pendingDownload ? (
        <ConfirmDialog
          title="Download this file?"
          body={'Do you want to download ' + (fileTitle(pendingDownload.label) || 'this file') + '?'}
          confirmLabel="Download"
          cancelVariant="danger"
          confirmVariant="primary"
          busy={false}
          error={null}
          onConfirm={() => {
            void download(pendingDownload);
            setPendingDownload(null);
          }}
          onClose={() => setPendingDownload(null)}
        />
      ) : null}
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

function fileTitle(label: string): string {
  const trimmed = label.trim();
  const dot = trimmed.lastIndexOf('.');
  return dot > 0 ? trimmed.slice(0, dot) : trimmed;
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
        preload="metadata"
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
        onDurationChange={() => {
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
      <span className="shrink-0 text-xs tabular-nums text-muted">
        {formatAudioTime(progress)} / {formatAudioTime(duration)}
      </span>
    </div>
  );
}

function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  return String(Math.floor(total / 60)) + ':' + String(total % 60).padStart(2, '0');
}

function FileTools({
  file,
  isHost,
  busy,
  onDownload,
  onRemove,
}: {
  file: SessionFile;
  isHost: boolean;
  busy: boolean;
  onDownload: (file: SessionFile) => void;
  onRemove: () => void;
}) {
  return (
    <div className="absolute right-2 top-2 z-10 flex items-center gap-1">
      <button
        type="button"
        onClick={() => void onDownload(file)}
        aria-label="Download"
        className="flex h-7 w-7 items-center justify-center rounded-full bg-card text-canal"
      >
        <DownloadIcon />
      </button>
      {isHost ? <RemoveButton busy={busy} onClick={onRemove} /> : null}
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 2.5v7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M5.25 7.25 8 10l2.75-2.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.5 13h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function RemoveButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label="Remove"
      className="flex h-7 w-7 items-center justify-center rounded-full bg-card text-sm leading-none text-clay disabled:opacity-50"
    >
      X
    </button>
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
    <label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md bg-canal px-3.5 text-sm font-medium text-on-canal hover:bg-canal-dark has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-canal">
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
