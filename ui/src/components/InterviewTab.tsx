import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { Pov } from '../pov';
import type { CaseDetail } from '../types';
import { AttachControl, AttachmentList } from './Attachments';
import { Spinner, firstName } from './ui';
import { useDictation } from './useDictation';

export default function InterviewTab({
  c,
  onChange,
  pov,
  onSwitch,
}: {
  c: CaseDetail;
  onChange: (c: CaseDetail) => void;
  pov: Pov;
  onSwitch: () => void;
}) {
  const self = pov === 'leaver';
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState<'answer' | 'finish' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const name = firstName(c.person.name);
  const interviewing = c.status === 'INTERVIEWING';
  const titles = Object.fromEntries(c.items.map((i) => [i.id, i.title]));
  const topics = c.items.filter((i) => i.needsInterview).sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0));
  const voice = useDictation((text) => setAnswer((prev) => (prev ? `${prev.trimEnd()} ${text}` : text)));
  const forTurn = (label: string) => c.attachments.filter((a) => a.turnLabel === label);
  const forQuestion = (itemId: string) => c.attachments.filter((a) => a.itemId === itemId && !a.turnLabel);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [c.turns.length, c.currentQuestion?.question]);

  async function run(kind: 'answer' | 'finish') {
    if (kind === 'answer' && !answer.trim()) return;
    if (voice.listening) voice.stop();
    setBusy(kind);
    setError(null);
    try {
      onChange(kind === 'answer' ? await api.answer(c.id, answer.trim()) : await api.finish(c.id));
      if (kind === 'answer') setAnswer('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="interview">
      <div className="record">
        <div className="turns">
          {c.turns.length === 0 && interviewing && (
            <p className="muted small" style={{ paddingTop: 18 }}>
              {self ? 'handover.ai has already read your' : `handover.ai has already read ${name}\u2019s`} code, tickets
              and documents. It only asks about the {topics.length} things they don&rsquo;t explain.
            </p>
          )}
          {c.turns.map((t) => (
            <div className="turn" key={t.label}>
              <div className="topic">{titles[t.itemId] ?? 'General'}</div>
              <p className="q">{t.question}</p>
              <p className="a">
                {t.answer}
                <span className="label">{t.label}</span>
              </p>
              <div className="turn-att">
                <AttachmentList items={forTurn(t.label)} c={c} onChange={onChange} />
                {self && <AttachControl c={c} itemId={t.itemId} turnLabel={t.label} onChange={onChange} />}
              </div>
            </div>
          ))}
          {interviewing && c.currentQuestion && !busy && (
            <div className="turn current">
              <div className="topic">
                {c.currentQuestion.itemTitle}
                {c.currentQuestion.isFollowup && ', follow-up'}
              </div>
              <p className="q">{c.currentQuestion.question}</p>
              <div className="turn-att">
                <AttachmentList items={forQuestion(c.currentQuestion.itemId)} c={c} onChange={onChange} />
                {self ? (
                  <AttachControl
                    c={c}
                    itemId={c.currentQuestion.itemId}
                    label="Easier to show? Add a recording or a Drive link"
                    onChange={onChange}
                  />
                ) : (
                  <p className="small muted">Waiting for {name} to answer.</p>
                )}
              </div>
            </div>
          )}
          {busy && (
            <div className="thinking">
              <Spinner /> {busy === 'finish' ? 'Writing the handover notes' : 'Reading the answer'}
            </div>
          )}
          {!interviewing && (
            <p className="note done" style={{ margin: '18px 0 4px' }}>
              Interview finished with {c.turns.length} answers. The handover notes are written.
            </p>
          )}
          <div ref={end} />
        </div>

        {interviewing && !self && (
          <div className="observer">
            <p className="small muted">
              {name} answers from their own view, so the knowledge is in their words. You can follow along here.
            </p>
            <button className="btn quiet" onClick={onSwitch}>
              See it as {name}
            </button>
          </div>
        )}

        {interviewing && self && (
          <div className="compose">
            {error && <p className="note error">{error}</p>}
            <textarea
              className={`field ${voice.listening ? 'listening' : ''}`}
              placeholder={voice.listening ? 'Listening… speak your answer' : 'Your answer, typed or spoken'}
              value={answer}
              disabled={busy !== null}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) run('answer');
              }}
              aria-label="Answer"
            />
            {voice.interim && <p className="small muted interim">{voice.interim}</p>}
            {voice.error && <p className="note error">{voice.error}</p>}
            <div className="row">
              <button className="link-btn small" onClick={() => run('finish')} disabled={busy !== null}>
                Finish and write the notes
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                {voice.supported && (
                  <button
                    className={`btn quiet mic ${voice.listening ? 'on' : ''}`}
                    onClick={() => (voice.listening ? voice.stop() : voice.start())}
                    disabled={busy !== null}
                    aria-pressed={voice.listening}
                  >
                    <span className="mic-dot" /> {voice.listening ? 'Stop speaking' : 'Speak'}
                  </button>
                )}
                <button className="btn" onClick={() => run('answer')} disabled={busy !== null || !answer.trim()}>
                  Send answer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="topics">
        <h3>Topics, most important first</h3>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {topics.map((i) => {
          const done = i.coverage === 'INTERVIEWED';
          const now = interviewing && c.currentQuestion?.itemId === i.id;
          return (
            <li key={i.id} className={done ? 'done' : now ? 'now' : ''}>
              <i />
              <span>{i.title}</span>
            </li>
          );
        })}
        </ul>
      </div>
    </div>
  );
}
