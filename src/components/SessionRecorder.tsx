'use client';

import { useEffect, useRef, useState } from 'react';
import { actionError } from '@/lib/errors';
import { uploadSessionFile } from '@/lib/photos';
import { Button } from '@/components/ui';

const noticeKey = 'komunyon-recording-background-notice';

export function SessionRecorder({ studyId, date, uid }: { studyId: string; date: string; uid: string }) {
  const [recording, setRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const [noticeVisible, setNoticeVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const extension = blob.type.includes('mp4') || blob.type.includes('m4a') ? 'm4a' : 'webm';
        const file = new File([blob], 'recording-' + new Date().toISOString() + '.' + extension, { type: blob.type });
        setSaving(true);
        void uploadSessionFile(studyId, date, uid, file)
          .catch((failure: unknown) => setError(actionError(failure)))
          .finally(() => setSaving(false));
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      };
      streamRef.current = stream;
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      if (window.localStorage.getItem(noticeKey) !== 'dismissed') setNoticeVisible(true);
    } catch (failure) {
      setError(actionError(failure));
    }
  }

  function stop() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  return (
    <div className="max-w-lg">
      {noticeVisible ? (
        <div className="mb-3 rounded-lg border border-line bg-card p-3 text-sm text-muted" role="status">
          <div className="flex items-start justify-between gap-3">
            <p>Keep Komunyon open while recording. You may switch apps, but do not fully close this app or browser tab.</p>
            <button type="button" className="shrink-0 text-muted underline underline-offset-2 hover:text-ink" onClick={() => {
              window.localStorage.setItem(noticeKey, 'dismissed');
              setNoticeVisible(false);
            }}>
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
      <Button variant="secondary" className="w-full" onClick={recording ? stop : () => void start()} disabled={saving}>
        {saving ? 'Saving recording…' : recording ? 'End recording' : 'Record session'}
      </Button>
      {recording ? <p className="mt-2 text-sm text-clay">Recording in progress. Keep this app open.</p> : null}
      {error ? <p className="mt-2 text-sm text-clay">{error}</p> : null}
    </div>
  );
}
