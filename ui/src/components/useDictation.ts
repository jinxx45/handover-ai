import { useEffect, useRef, useState } from 'react';

/* Browser speech-to-text (Chrome, Edge, Safari). Nothing leaves the browser except to the
   browser vendor's speech service; no audio is stored by handover.ai. */
type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

export function useDictation(onText: (finalText: string) => void) {
  const Ctor = (typeof window !== 'undefined' &&
    ((window as unknown as { SpeechRecognition?: new () => Recognition }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition)) as
    | (new () => Recognition)
    | undefined;
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const cb = useRef(onText);
  cb.current = onText;

  useEffect(() => () => rec.current?.stop(), []);

  function start() {
    if (!Ctor) return;
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = navigator.language || 'en-IN';
    r.onresult = (e) => {
      let partial = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) cb.current(res[0].transcript.trim());
        else partial += res[0].transcript;
      }
      setInterim(partial);
    };
    r.onerror = (e) => setError(e.error === 'not-allowed' ? 'Microphone access was blocked.' : `Dictation stopped: ${e.error}`);
    r.onend = () => {
      setListening(false);
      setInterim('');
    };
    rec.current = r;
    setError(null);
    r.start();
    setListening(true);
  }

  function stop() {
    rec.current?.stop();
  }

  return { supported: !!Ctor, listening, interim, error, start, stop };
}
