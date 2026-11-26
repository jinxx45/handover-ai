import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { Pov } from '../pov';
import type { CaseDetail, KitTask } from '../types';
import { Cite, type Sources } from './Cited';
import { Spinner, firstName } from './ui';

const TYPE: Record<KitTask['type'], string> = {
  read: 'Read',
  watch: 'Watch',
  meet: 'Meet',
  shadow: 'Shadow',
  do: 'Do',
  learn: 'Learn',
};

function useChecked(caseId: string) {
  const key = `handover.kit.${caseId}`;
  const [done, setDone] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? '{}');
    } catch {
      return {};
    }
  });
  function toggle(id: string) {
    setDone((d) => {
      const next = { ...d, [id]: !d[id] };
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* storage may be unavailable */
      }
      return next;
    });
  }
  return { done, toggle };
}

function asChecklist(c: CaseDetail): string {
  const k = c.onboarding!;
  const phases = k.phases
    .map((p) => `## ${p.name}\n${p.goal}\n\n${p.tasks.map((t) => `- [ ] ${TYPE[t.type]}: ${t.title}${t.detail ? ` (${t.detail})` : ''}`).join('\n')}`)
    .join('\n\n');
  const people = k.people.map((p) => `- ${p.name}: ${p.why}`).join('\n');
  return `# ${k.title}\n\n${k.intro}\n\n${phases}\n\n## People to meet\n${people}\n`;
}

export default function OnboardingTab({ c, onChange, pov }: { c: CaseDetail; onChange: (c: CaseDetail) => void; pov: Pov }) {
  const forYou = pov === 'newhire';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const started = useRef(false);
  const { done, toggle } = useChecked(c.id);
  const name = firstName(c.person.name);
  const sources: Sources = { evidence: c.evidence, turns: c.turns, pack: c.pack };

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      onChange(await api.onboarding(c.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!c.onboarding && !started.current) {
      started.current = true;
      generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!c.onboarding) {
    return (
      <div className="backfill-empty">
        {busy ? (
          <p className="thinking">
            <Spinner /> Building the onboarding kit from {name}&apos;s work
          </p>
        ) : (
          <button className="btn" onClick={generate}>
            Build the onboarding kit
          </button>
        )}
        {error && <p className="note error">{error}</p>}
      </div>
    );
  }

  const k = c.onboarding;
  const total = k.phases.reduce((n, p) => n + p.tasks.length, 0);
  const finished = k.phases.reduce((n, p, pi) => n + p.tasks.filter((_, ti) => done[`${pi}.${ti}`]).length, 0);

  return (
    <div className="kit">
      <div className="bf-head">
        <div>
          <p className="small muted">{forYou ? `Built from ${name}\u2019s work, for you` : `For whoever takes over from ${name}`}</p>
          <h2>{k.title}</h2>
          <p className="bf-summary">{k.intro}</p>
          <p className="small muted num">
            {finished} of {total} done
          </p>
        </div>
        <div className="bf-actions">
          <button
            className="btn"
            onClick={async () => {
              await navigator.clipboard.writeText(asChecklist(c));
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? 'Copied' : 'Copy as checklist'}
          </button>
          {!forYou && (
            <button className="link-btn small" onClick={generate} disabled={busy}>
              {busy ? 'Rebuilding…' : 'Rebuild with the latest answers'}
            </button>
          )}
        </div>
      </div>
      {error && <p className="note error">{error}</p>}

      {k.people.length > 0 && (
        <section className="kit-people">
          <h3>People to meet</h3>
          <ul>
            {k.people.map((p) => (
              <li key={p.name}>
                <b>{p.name}</b>
                <p>
                  {p.why}
                  {p.citations.map((id) => (
                    <Cite key={id} id={id} sources={sources} />
                  ))}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ol className="phases">
        {k.phases.map((p, pi) => (
          <li key={p.name} className="phase">
            <div className="phase-head">
              <h3>{p.name}</h3>
              <p>{p.goal}</p>
            </div>
            <ul className="tasks">
              {p.tasks.map((t, ti) => {
                const id = `${pi}.${ti}`;
                const isMedia = t.type === 'watch' && t.link?.startsWith('/v1/media/');
                return (
                  <li key={id} className={done[id] ? 'done' : ''}>
                    <label className="task">
                      <input type="checkbox" checked={!!done[id]} onChange={() => toggle(id)} />
                      <span className="task-type">{TYPE[t.type]}</span>
                      <span className="task-body">
                        <span className="task-title">
                          {t.link && !isMedia && t.link !== '#pack' ? (
                            <a href={t.link} target="_blank" rel="noreferrer">
                              {t.title}
                            </a>
                          ) : (
                            t.title
                          )}
                        </span>
                        {t.detail && (
                          <span className="task-detail">
                            {t.detail}
                            {t.citations.map((cid) => (
                              <Cite key={cid} id={cid} sources={sources} />
                            ))}
                          </span>
                        )}
                        {isMedia && <video className="task-video" src={t.link!} controls preload="metadata" />}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
