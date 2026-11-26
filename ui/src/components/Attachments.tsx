import { useRef, useState } from 'react';
import { api } from '../api';
import type { AttachmentView, CaseDetail } from '../types';
import { Spinner } from './ui';

function where(url: string): string {
  if (/drive\.google|docs\.google/.test(url)) return 'Google Drive';
  if (/loom\.com/.test(url)) return 'Loom';
  if (/youtube\.com|youtu\.be/.test(url)) return 'YouTube';
  if (/sharepoint|onedrive/.test(url)) return 'SharePoint';
  if (/vimeo\.com/.test(url)) return 'Vimeo';
  if (/confluence|atlassian/.test(url)) return 'Confluence';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Link';
  }
}

/** Shows recordings inline and links as labelled rows. */
export function AttachmentList({ items, c, onChange }: { items: AttachmentView[]; c: CaseDetail; onChange?: (c: CaseDetail) => void }) {
  if (items.length === 0) return null;
  return (
    <ul className="attachments">
      {items.map((a) => (
        <li key={a.id}>
          {a.kind === 'video' ? (
            <figure>
              <video src={a.url} controls preload="metadata" />
              <figcaption>{a.title}</figcaption>
            </figure>
          ) : a.kind === 'audio' ? (
            <figure>
              <figcaption>{a.title}</figcaption>
              <audio src={a.url} controls preload="metadata" />
            </figure>
          ) : (
            <a href={a.url} target="_blank" rel="noreferrer" className="att-link">
              <b>{a.title}</b>
              <span>{where(a.url)}</span>
            </a>
          )}
          {onChange && (
            <button className="link-btn small att-remove" onClick={async () => onChange(await api.removeAttachment(c.id, a.id))}>
              Remove
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

type Mode = null | 'link' | 'upload' | 'record';

/** Add a link, upload a video, or record the screen, attached to an answer (turnLabel) or an item. */
export function AttachControl({
  c, itemId, turnLabel, label = 'Add a video or link', onChange,
}: { c: CaseDetail; itemId?: string | null; turnLabel?: string | null; label?: string; onChange: (c: CaseDetail) => void }) {
  const [mode, setMode] = useState<Mode>(null);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const addedBy = c.person.name;
  const canRecord = typeof window !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia && typeof MediaRecorder !== 'undefined';

  function reset() {
    setMode(null);
    setUrl('');
    setTitle('');
    setError(null);
  }

  async function run(fn: () => Promise<CaseDetail>) {
    setBusy(true);
    setError(null);
    try {
      onChange(await fn());
      reset();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function startRecording() {
    setError(null);
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      let mic: MediaStream | null = null;
      try {
        mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        /* recording without narration is still useful */
      }
      const stream = new MediaStream([...screen.getTracks(), ...(mic ? mic.getAudioTracks() : [])]);
      chunks.current = [];
      const rec = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm' });
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const blob = new Blob(chunks.current, { type: 'video/webm' });
        run(() => api.upload(c.id, blob, { title: title || 'Screen walkthrough', itemId, turnLabel, addedBy }));
      };
      screen.getVideoTracks()[0].addEventListener('ended', () => rec.state === 'recording' && rec.stop());
      recorder.current = rec;
      rec.start(1000);
      setRecording(true);
    } catch (e) {
      setError(`Recording didn't start: ${(e as Error).message}`);
    }
  }

  if (mode === null) {
    return (
      <button className="link-btn small att-add" onClick={() => setMode('link')}>
        {label}
      </button>
    );
  }

  return (
    <div className="att-panel">
      <div className="att-modes" role="tablist">
        <button role="tab" aria-selected={mode === 'link'} onClick={() => setMode('link')}>Paste a link</button>
        <button role="tab" aria-selected={mode === 'upload'} onClick={() => setMode('upload')}>Upload a video</button>
        {canRecord && <button role="tab" aria-selected={mode === 'record'} onClick={() => setMode('record')}>Record your screen</button>}
      </div>
      <input className="field" placeholder="What does it show? e.g. Replaying the dead-letter queue" value={title} onChange={(e) => setTitle(e.target.value)} />
      {mode === 'link' && (
        <input className="field" placeholder="Google Drive, Loom, YouTube or SharePoint link" value={url} onChange={(e) => setUrl(e.target.value)} />
      )}
      {mode === 'upload' && (
        <input
          className="field"
          type="file"
          accept="video/*,audio/*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) run(() => api.upload(c.id, f, { title: title || f.name, itemId, turnLabel, addedBy }, f.name));
          }}
        />
      )}
      {mode === 'record' && (
        <p className="small muted">
          Pick a window or screen, talk through what you&apos;re doing, then stop. It&apos;s saved to this answer.
        </p>
      )}
      <div className="att-foot">
        <button className="link-btn small" onClick={reset} disabled={busy || recording}>
          Cancel
        </button>
        {mode === 'link' && (
          <button className="btn" disabled={busy || !url.trim()} onClick={() => run(() => api.addLink(c.id, { url: url.trim(), title, itemId, turnLabel, addedBy }))}>
            Add link
          </button>
        )}
        {mode === 'record' &&
          (recording ? (
            <button className="btn rec" onClick={() => recorder.current?.stop()}>
              <span className="rec-dot" /> Stop and save
            </button>
          ) : (
            <button className="btn" onClick={startRecording} disabled={busy}>
              Start recording
            </button>
          ))}
        {busy && <Spinner />}
      </div>
      {error && <p className="note error">{error}</p>}
    </div>
  );
}
