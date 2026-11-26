import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Runway, Spinner, Strip, daysLeftLabel, firstName, formatDate, itemState } from '../components/ui';
import type { CaseDetail, CaseStatus, DemoPerson } from '../types';

const STATUS_TEXT: Record<CaseStatus, string> = {
  MAPPING: 'Mapping what they own',
  INTERVIEWING: 'Interview in progress',
  REVIEW: 'Pack waiting for review',
  PUBLISHED: 'Pack published',
  FAILED: 'Needs attention',
};

function headline(c: CaseDetail): string {
  if (c.status === 'FAILED') return 'The interview could not start. Open the case to retry.';
  const risk = c.items.filter((i) => itemState(i) === 'risk').length;
  const owner = c.items.filter((i) => itemState(i) === 'owner').length;
  const open = [risk && `${risk} at risk`, owner && `${owner} ${owner === 1 ? 'needs' : 'need'} a new owner`].filter(Boolean);
  return open.length ? `${STATUS_TEXT[c.status]}. ${open.join(', ')}.` : `${STATUS_TEXT[c.status]}. Nothing left open.`;
}

export default function HomePage() {
  const navigate = useNavigate();
  const [people, setPeople] = useState<DemoPerson[]>([]);
  const [cases, setCases] = useState<CaseDetail[] | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.people(), api.cases()])
      .then(async ([p, summaries]) => {
        setPeople(p);
        setCases(await Promise.all(summaries.map((s) => api.case(s.id))));
      })
      .catch((e: Error) => {
        setError(`Couldn't load departures: ${e.message}. Check that the backend is running on port 8080.`);
        setCases([]);
      });
  }, []);

  async function start(personId: string) {
    setStarting(personId);
    setError(null);
    try {
      const created = await api.depart(personId);
      navigate(`/cases/${created.id}?as=leaver`);
    } catch (e) {
      setError(`Couldn't start the handover: ${(e as Error).message}`);
      setStarting(null);
    }
  }

  return (
    <div className="home">
      <section>
        <h1>Departures</h1>
        <p className="lede">
          Everyone currently working their notice. Each block is one thing they own; the goal is to turn every red and
          amber block green before their last day.
        </p>
        {error && (
          <p className="note error" style={{ marginBottom: 16 }}>
            {error}
          </p>
        )}
        <div className="departures">
          {cases === null && <p className="empty">Loading departures…</p>}
          {cases?.length === 0 && !error && (
            <p className="empty">Nobody is leaving yet. Start a handover from the demo people on the right.</p>
          )}
          {cases?.map((c) => (
            <Link key={c.id} to={`/cases/${c.id}?as=manager`} className="departure">
              <div className="who">
                <b>{c.person.name}</b>
                <span className="muted small">{c.person.role}</span>
              </div>
              <div>
                <Strip items={c.items} />
                <div className="small muted" style={{ marginTop: 8 }}>
                  {headline(c)}
                </div>
              </div>
              <div className="when">
                <div className="num">{daysLeftLabel(c.person.daysLeft)}</div>
                <div className="small faint" style={{ marginBottom: 8 }}>
                  Last day {formatDate(c.person.lastDay)}
                </div>
                <Runway start={c.createdAt} lastDay={c.person.lastDay} />
              </div>
            </Link>
          ))}
        </div>
      </section>

      <aside className="demo">
        <h2>Try it with demo data</h2>
        <p>Each button sends a resignation event, the same one Workday would send.</p>
        {people.map((p) => (
          <div className="demo-person" key={p.personId}>
            <b>{p.name}</b>
            <div className="small muted">{p.role}</div>
            <button className="btn quiet" disabled={starting !== null} onClick={() => start(p.personId)}>
              {starting === p.personId ? (
                <>
                  <Spinner /> Mapping {firstName(p.name)}&apos;s work
                </>
              ) : (
                `${firstName(p.name)} resigns`
              )}
            </button>
          </div>
        ))}
      </aside>
    </div>
  );
}
