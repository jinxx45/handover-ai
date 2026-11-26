import { useState } from 'react';
import { api } from '../api';
import type { CaseDetail, QuestionView } from '../types';
import { CitedText, type Sources } from './Cited';
import { Spinner, firstName } from './ui';

export default function AskTab({ c }: { c: CaseDetail }) {
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState<QuestionView[]>(c.questions);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = firstName(c.person.name);
  const sources: Sources = { evidence: c.evidence, turns: c.turns, pack: c.pack };

  const tryThese = [
    ...c.items
      .filter((i) => i.kind === 'approval')
      .slice(0, 1)
      .map((i) =>
        i.title.startsWith('Approves ')
          ? `How do I decide on ${i.title.slice(9, 10).toLowerCase()}${i.title.slice(10)}?`
          : `How did ${name} handle ${i.title.charAt(0).toLowerCase()}${i.title.slice(1)}?`,
      ),
    ...c.items
      .filter((i) => i.needsInterview && i.kind !== 'approval')
      .slice(0, 2)
      .map((i) => (i.kind === 'recurring_task' ? `How do I run the ${i.title.charAt(0).toLowerCase()}${i.title.slice(1)}?` : `What should I know about ${i.title}?`)),
  ];

  async function ask(q: string) {
    const text = q.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      const a = await api.ask(c.id, text);
      setHistory((h) => [a, ...h]);
      setQuestion('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!c.pack) return <p className="muted">You can ask questions once the handover notes are written.</p>;

  return (
    <div className="ask">
      <p className="muted" style={{ maxWidth: '64ch', marginBottom: 14 }}>
        Ask what you would have asked {name}. Answers come only from the handover notes, the interview and {name}&apos;s
        work, and show where each fact came from. If something isn&apos;t covered, it says so.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
      >
        <input
          className="field"
          placeholder={`Ask about ${name}'s work`}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={busy}
          aria-label="Your question"
        />
        <button className="btn" disabled={busy || !question.trim()}>
          {busy && <Spinner />} Ask
        </button>
      </form>
      {tryThese.length > 0 && (
        <div className="try">

          {tryThese.map((s) => (
            <button key={s} className="chip" onClick={() => ask(s)} disabled={busy}>
              {s}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p className="note error" style={{ marginTop: 14 }}>
          {error}
        </p>
      )}

      <div style={{ marginTop: 24 }}>
        {history.map((q) => (
          <div className="qa" key={q.id}>
            <p className="q">{q.question}</p>
            {q.covered ? (
              <p className="a">
                <CitedText text={q.answer} sources={sources} />
              </p>
            ) : (
              <p className="uncovered">Not covered in the handover. Ask {c.person.managerName ?? 'your manager'}.</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
