import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { CaseDetail, Skill } from '../types';
import { Cite, type Sources } from './Cited';
import { Spinner, firstName } from './ui';

const GROUPS: { key: Skill['category']; label: string }[] = [
  { key: 'Technical', label: 'Technical' },
  { key: 'Responsibility', label: 'Responsibilities they carry' },
  { key: 'Domain', label: 'Business knowledge' },
  { key: 'People', label: 'Working with people' },
];

function asJobDescription(c: CaseDetail): string {
  const b = c.backfill!;
  const list = (p: Skill['priority']) =>
    b.skills.filter((s) => s.priority === p).map((s) => `- ${s.name}: ${s.why}`).join('\n');
  return `# ${b.title}\n\n${b.summary}\n\n## Must have\n${list('must')}\n\n## Nice to have\n${list('nice')}\n`;
}

export default function BackfillTab({ c, onChange }: { c: CaseDetail; onChange: (c: CaseDetail) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const started = useRef(false);
  const name = firstName(c.person.name);
  const sources: Sources = { evidence: c.evidence, turns: c.turns, pack: c.pack };

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      onChange(await api.backfill(c.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!c.backfill && !started.current) {
      started.current = true;
      generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function copy() {
    await navigator.clipboard.writeText(asJobDescription(c));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!c.backfill) {
    return (
      <div className="backfill-empty">
        {busy ? (
          <p className="thinking">
            <Spinner /> Reading {name}&apos;s work to find the skills the role needs
          </p>
        ) : (
          <button className="btn" onClick={generate}>
            Find the skills for this role
          </button>
        )}
        {error && <p className="note error">{error}</p>}
      </div>
    );
  }

  const b = c.backfill;
  const musts = b.skills.filter((s) => s.priority === 'must').length;

  return (
    <div className="backfill">
      <div className="bf-head">
        <div>
          <p className="small muted">Hiring to replace {name}</p>
          <h2>{b.title}</h2>
          <p className="bf-summary">{b.summary}</p>
          <p className="small muted">
            {musts} must-have and {b.skills.length - musts} nice-to-have skills, each based on {name}&apos;s real work.
            Update it after the interview for a better list.
          </p>
        </div>
        <div className="bf-actions">
          <button className="btn" onClick={copy}>
            {copied ? 'Copied' : 'Copy as job description'}
          </button>
          <button className="link-btn small" onClick={generate} disabled={busy}>
            {busy ? 'Updating…' : 'Update'}
          </button>
        </div>
      </div>
      {error && <p className="note error">{error}</p>}

      <div className="bf-groups">
        {GROUPS.map((g) => {
          const skills = b.skills.filter((s) => s.category === g.key);
          if (skills.length === 0) return null;
          return (
            <section key={g.key} className="bf-group">
              <h3>{g.label}</h3>
              <ul>
                {[...skills]
                  .sort((x, y) => (x.priority === y.priority ? 0 : x.priority === 'must' ? -1 : 1))
                  .map((s) => (
                    <li key={s.name} className={s.priority}>
                      <div className="bf-skill">
                        <b>{s.name}</b>
                        <span className={`bf-tag ${s.priority}`}>{s.priority === 'must' ? 'Must have' : 'Nice to have'}</span>
                      </div>
                      <p>
                        {s.why}
                        {s.citations.map((id) => (
                          <Cite key={id} id={id} sources={sources} />
                        ))}
                      </p>
                    </li>
                  ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
