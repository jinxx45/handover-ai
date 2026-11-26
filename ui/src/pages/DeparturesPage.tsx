import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { STATE_LABEL, Spinner, firstName, formatDate, itemState, type ItemState } from '../components/ui';
import type { CaseDetail, CaseStatus, DemoPerson } from '../types';

const SAFE: ItemState[] = ['captured', 'documented', 'low'];
const TILE_ORDER: ItemState[] = ['captured', 'documented', 'low', 'owner', 'risk'];
const STAGES: { key: CaseStatus; label: string }[] = [
  { key: 'MAPPING', label: 'Found work' },
  { key: 'INTERVIEWING', label: 'Interview' },
  { key: 'REVIEW', label: 'Review' },
  { key: 'PUBLISHED', label: 'Published' },
];
const KEY: ItemState[] = ['captured', 'documented', 'owner', 'risk'];

function tileNote(state: ItemState, successor: string | null) {
  if (state === 'owner') return 'Needs owner';
  if (state === 'risk') return 'Not written down';
  if (successor) return `To ${firstName(successor)}`;
  return STATE_LABEL[state];
}

/** One card per departure. Every owned thing is a tile; safe tiles sort first, so the card fills as the handover completes. */
function DepartureCard({ c }: { c: CaseDetail }) {
  const items = [...c.items].sort(
    (a, b) => TILE_ORDER.indexOf(itemState(a)) - TILE_ORDER.indexOf(itemState(b)) || (b.riskScore ?? 0) - (a.riskScore ?? 0),
  );
  const name = firstName(c.person.name);
  const safe = items.filter((i) => SAFE.includes(itemState(i))).length;
  const owner = items.filter((i) => itemState(i) === 'owner').length;
  const head = items.filter((i) => itemState(i) === 'risk').length;
  const rest = [owner && `${owner} ${owner === 1 ? 'needs' : 'need'} a new owner`, head && `${head} not written down`].filter(Boolean).join(', ');
  const stage = c.status === 'FAILED' ? 0 : STAGES.findIndex((s) => s.key === c.status);
  const days = c.person.daysLeft;

  return (
    <article className="dcard">
      <header className="dc-head">
        <div>
          <h2>
            <Link to={`/cases/${c.id}?as=manager`}>{c.person.name}</Link>
          </h2>
          <p>{c.person.role}</p>
        </div>
        {days !== null && (
          <div className="dc-days">
            <b>{Math.max(days, 0)}</b>
            <span>
              {days === 1 ? 'day of notice period left' : 'days of notice period left'}
              <small>Last day {formatDate(c.person.lastDay)}</small>
            </span>
          </div>
        )}
      </header>
      <p className="dc-sum">
        <b>
          {safe} of {items.length} handed over.
        </b>{' '}
        {rest ? `${rest[0].toUpperCase()}${rest.slice(1)}.` : 'Ready to publish.'}
      </p>
      <ul className="dc-tiles" aria-label={`What ${name} owns`}>
        {items.map((i, n) => {
          const s = itemState(i);
          return (
            <li key={i.id} className={`t-${s}`} style={{ ['--n' as string]: n }} title={`${i.title}: ${STATE_LABEL[s]}`}>
              <span className="tt">{i.title}</span>
              <span className="ts">{tileNote(s, i.successor)}</span>
            </li>
          );
        })}
      </ul>
      <footer className="dc-foot">
        <ol className="dc-stage" aria-label={c.status === 'FAILED' ? 'Needs attention' : `Stage ${stage + 1} of 4: ${STAGES[stage].label}`}>
          {STAGES.map((s, n) => (
            <li key={s.key} className={c.status === 'FAILED' && n === 0 ? 'failed' : n < stage || c.status === 'PUBLISHED' ? 'done' : n === stage ? 'now' : ''}>
              {c.status === 'FAILED' && n === 0 ? 'Needs attention' : s.label}
            </li>
          ))}
        </ol>
        <div className="row">
          {c.status !== 'PUBLISHED' && (
            <Link className="btn ghost" to={`/cases/${c.id}?as=leaver`}>
              Continue as {name}
            </Link>
          )}
          <Link className="btn" to={`/cases/${c.id}?as=manager`}>
            Open handover
          </Link>
        </div>
      </footer>
    </article>
  );
}

export default function DeparturesPage() {
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
        setError(`Couldn't load departures: ${e.message}. Check that the backend is running.`);
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

  const open = (cases ?? []).reduce((n, c) => n + c.items.filter((i) => !SAFE.includes(itemState(i))).length, 0);
  const n = cases?.length ?? 0;
  const lede =
    cases === null
      ? 'Loading departures…'
      : n === 0
        ? 'Nobody is leaving right now.'
        : `${n} ${n === 1 ? 'person is' : 'people are'} handing over. ${open ? `${open} ${open === 1 ? 'thing isn’t' : 'things aren’t'} handed over yet.` : 'Everything is handed over.'}`;
  const leaving = new Set((cases ?? []).map((c) => c.person.personId));
  const waiting = people.filter((p) => !leaving.has(p.personId));

  return (
    <div className="dep">
      <header className="dep-head">
        <div>
          <h1>Departures</h1>
          <p>{lede}</p>
        </div>
        {n > 0 && (
          <ul className="dep-key" aria-label="Tile colours">
            {KEY.map((k) => (
              <li key={k} className={`t-${k}`}>
                {STATE_LABEL[k]}
              </li>
            ))}
          </ul>
        )}
      </header>

      {error && (
        <p className="note error" style={{ marginBottom: 20 }}>
          {error}
        </p>
      )}

      {n > 0 ? (
        <div className="dep-list">
          {cases!.map((c) => (
            <DepartureCard key={c.id} c={c} />
          ))}
        </div>
      ) : (
        cases !== null && (
          <div className="dep-empty">
            <ul className="dc-tiles ghost" aria-hidden="true">
              {Array.from({ length: 8 }, (_, i) => (
                <li key={i} style={{ ['--n' as string]: i }} />
              ))}
            </ul>
            <p>When Workday sends a resignation, the person’s work shows up here as tiles. Each tile turns green once it’s handed over.</p>
          </div>
        )
      )}

      {waiting.length > 0 && (
        <section className="dnext">
          <h3>{n ? 'Try another demo resignation' : 'Try a demo resignation'}</h3>
          <div className="dnext-row">
            {waiting.map((p) => (
              <button key={p.personId} className="dperson" disabled={starting !== null} onClick={() => start(p.personId)}>
                <span className="davatar" aria-hidden="true">
                  {p.name
                    .split(' ')
                    .map((w) => w[0])
                    .slice(0, 2)
                    .join('')}
                </span>
                <span>
                  <b>{p.name}</b>
                  <span className="small muted">{p.role}</span>
                </span>
                <span className="dgo">
                  {starting === p.personId ? (
                    <>
                      <Spinner /> Starting
                    </>
                  ) : (
                    'Resign'
                  )}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
