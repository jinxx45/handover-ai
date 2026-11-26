import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import AskTab from '../components/AskTab';
import BackfillTab from '../components/BackfillTab';
import CoverageTab from '../components/CoverageTab';
import InterviewTab from '../components/InterviewTab';
import OnboardingTab from '../components/OnboardingTab';
import PackTab from '../components/PackTab';
import { Runway, Spinner, Strip, daysLeftLabel, firstName, formatDate, itemState } from '../components/ui';
import { useSlidingPill } from '../components/useSlidingPill';
import { usePov, type Pov } from '../pov';
import type { CaseDetail, CaseStatus } from '../types';

type Tab = 'ledger' | 'interview' | 'pack' | 'ask' | 'backfill' | 'onboarding';

const TOOL: Record<string, string> = {
  github: 'GitHub', jira: 'Jira', confluence: 'Confluence', 'google-drive': 'Google Drive', drive: 'Google Drive',
  calendar: 'Calendar', pagerduty: 'PagerDuty', workday: 'Workday', crm: 'CRM',
};

/** Which tabs each person sees, in their order of importance. */
function tabsFor(pov: Pov, c: CaseDetail): { key: Tab; label: string; disabled?: boolean }[] {
  const name = firstName(c.person.name);
  if (pov === 'leaver') {
    return [
      { key: 'interview', label: `Interview (${c.turns.length})` },
      { key: 'ledger', label: 'What you own' },
      { key: 'pack', label: 'Your handover pack', disabled: !c.pack },
    ];
  }
  if (pov === 'newhire') {
    return [
      { key: 'onboarding', label: 'Your first 90 days' },
      { key: 'ask', label: `Ask ${name}'s handover` },
      { key: 'pack', label: 'Handover pack' },
    ];
  }
  return [
    { key: 'ledger', label: 'What they own' },
    { key: 'interview', label: `Interview (${c.turns.length})` },
    { key: 'pack', label: 'Handover pack', disabled: !c.pack },
    { key: 'backfill', label: 'Backfill', disabled: c.items.length === 0 },
    { key: 'onboarding', label: 'Onboarding kit', disabled: c.items.length === 0 },
  ];
}

function defaultTab(pov: Pov, status: CaseStatus): Tab {
  if (pov === 'leaver') return status === 'INTERVIEWING' ? 'interview' : status === 'MAPPING' || status === 'FAILED' ? 'ledger' : 'pack';
  if (pov === 'newhire') return 'onboarding';
  if (status === 'REVIEW') return 'pack';
  return 'ledger';
}

function Summary({ c, pov }: { c: CaseDetail; pov: Pov }) {
  const n = (s: string) => c.items.filter((i) => itemState(i) === s).length;
  const risk = n('risk');
  const owner = n('owner');
  const captured = n('captured') + n('documented');
  const name = firstName(c.person.name);

  if (pov === 'newhire') {
    return (
      <p className="summary">
        You&apos;re taking over {c.items.length} things from {name}. Everything below comes from {name}&apos;s actual work,
        so start with week 1.
      </p>
    );
  }
  if (pov === 'leaver') {
    const left = c.status === 'INTERVIEWING' ? c.currentQuestion?.remaining ?? 0 : 0;
    return (
      <p className="summary">
        {c.status === 'INTERVIEWING' ? (
          <>
            Thanks for helping whoever comes next. <span className="s-owner">{left + 1} topics left</span> in your interview,
            about {Math.max(5, (left + 1) * 4)} minutes. Talk or type, and show things on screen if that&apos;s easier.
          </>
        ) : c.status === 'REVIEW' ? (
          <>
            Your handover pack is written. <span className="s-owner">Check it for anything wrong or private</span> before{' '}
            {c.person.managerName ?? 'your manager'} publishes it.
          </>
        ) : c.status === 'PUBLISHED' ? (
          <>
            <span className="s-captured">Your handover is published.</span> Thank you; your successor can now ask it
            questions instead of messaging you.
          </>
        ) : (
          <>Check the list of what you own before the interview starts.</>
        )}
      </p>
    );
  }
  if (c.items.length === 0) return <p className="summary">No owned items were found for {name}.</p>;
  return (
    <p className="summary">
      {name} owns {c.items.length} things.{' '}
      <span className="s-captured">
        {captured} {captured === 1 ? 'is' : 'are'} captured or documented
      </span>
      {risk > 0 && (
        <>
          , <span className="s-risk">{risk} {risk === 1 ? 'is' : 'are'} at risk</span>
        </>
      )}
      {owner > 0 && (
        <>
          {risk > 0 ? ' and ' : ', '}
          <span className="s-owner">
            {owner} still {owner === 1 ? 'needs' : 'need'} a new owner
          </span>
        </>
      )}
      .
    </p>
  );
}

function Sources({ c }: { c: CaseDetail }) {
  const auto = new Map<string, number>();
  let manual = 0;
  for (const i of c.items) {
    if (i.origin === 'manual') manual++;
    else auto.set(TOOL[i.source] ?? i.source, (auto.get(TOOL[i.source] ?? i.source) ?? 0) + 1);
  }
  return (
    <ul className="sources">
      {[...auto.entries()].map(([tool, n]) => (
        <li key={tool}>
          <span>{tool}</span>
          <span className="num faint">{n}</span>
        </li>
      ))}
      <li>
        <span>Added by hand</span>
        <span className="num faint">{manual}</span>
      </li>
    </ul>
  );
}

function PovSwitch({ c, pov, setPov }: { c: CaseDetail; pov: Pov; setPov: (p: Pov) => void }) {
  const track = useSlidingPill<HTMLDivElement>("[aria-checked='true']", pov);
  const options: { key: Pov; who: string; role: string }[] = [
    { key: 'leaver', who: c.person.name, role: 'leaving' },
    { key: 'manager', who: c.person.managerName ?? 'Manager', role: 'their manager' },
    { key: 'newhire', who: 'New hire', role: 'taking over' },
  ];
  return (
    <div className="pov-row">
      <span className="pov-label">See it as</span>
      <div className="pov slide" ref={track} role="radiogroup" aria-label="See this handover as">
      {options.map((o) => (
        <button key={o.key} role="radio" aria-checked={pov === o.key} className={`pov-opt pov-${o.key}`} onClick={() => setPov(o.key)}>
          <i className="pov-avatar" aria-hidden="true">
            {o.key === 'newhire' ? '+' : o.who.split(' ').map((w) => w[0]).slice(0, 2).join('')}
          </i>
          <span className="pov-text">
            <b>{o.who}</b>
            <span>{o.role}</span>
          </span>
        </button>
      ))}
      </div>
    </div>
  );
}

function Rail({ c, pov }: { c: CaseDetail; pov: Pov }) {
  const name = firstName(c.person.name);
  const steps: Record<Pov, { label: string; done: boolean; now: boolean }[]> = {
    leaver: [
      { label: 'Check what you own', done: c.status !== 'MAPPING', now: c.status === 'MAPPING' },
      { label: 'Answer the interview', done: ['REVIEW', 'PUBLISHED'].includes(c.status), now: c.status === 'INTERVIEWING' },
      { label: 'Review your pack', done: c.status === 'PUBLISHED', now: c.status === 'REVIEW' },
      { label: 'Published', done: c.status === 'PUBLISHED', now: false },
    ],
    manager: [
      { label: 'Map what they own', done: c.status !== 'MAPPING', now: c.status === 'MAPPING' },
      { label: 'Interview', done: ['REVIEW', 'PUBLISHED'].includes(c.status), now: c.status === 'INTERVIEWING' },
      { label: 'Assign new owners', done: c.stats.toReassign === 0, now: c.stats.toReassign > 0 },
      { label: 'Publish the pack', done: c.status === 'PUBLISHED', now: c.status === 'REVIEW' },
    ],
    newhire: [
      { label: `Read ${name}'s pack`, done: false, now: true },
      { label: 'Week 1: context and people', done: false, now: false },
      { label: 'Weeks 2 to 4: shadow', done: false, now: false },
      { label: 'Days 31 to 90: own it', done: false, now: false },
    ],
  };
  return (
    <aside className="rail">
      <div>
        <Link to={`/?as=${pov}`} className="small muted">
          {pov === 'manager' ? 'Departures' : 'Home'}
        </Link>
        {pov === 'newhire' ? (
          <>
            <h1 style={{ marginTop: 8 }}>Welcome</h1>
            <div className="role">{c.person.role}</div>
            <div className="role">Taking over from {c.person.name}</div>
          </>
        ) : (
          <>
            <h1 style={{ marginTop: 8 }}>{pov === 'leaver' ? `Hi ${name}` : c.person.name}</h1>
            <div className="role">{c.person.role}</div>
            <div className="role">Reports to {c.person.managerName ?? 'nobody listed'}</div>
          </>
        )}
      </div>

      {pov !== 'newhire' && (
        <div className="rail-block">
          <h3>{pov === 'leaver' ? 'Your notice period' : 'Notice period'}</h3>
          <Runway start={c.createdAt} lastDay={c.person.lastDay} />
          <div className="big num">
            {daysLeftLabel(c.person.daysLeft)}, last day {formatDate(c.person.lastDay)}
          </div>
        </div>
      )}

      <div className="rail-block">
        <h3>{pov === 'newhire' ? `What ${name} handed over` : 'Handed over so far'}</h3>
        <Strip items={c.items} large />
      </div>

      {pov === 'manager' && (
        <div className="rail-block">
          <h3>Where the map came from</h3>
          <Sources c={c} />
        </div>
      )}

      <div className="rail-block">
        <h3>{pov === 'newhire' ? 'Your path' : 'Progress'}</h3>
        <ol className="steps">
          {steps[pov].map((s, i) => (
            <li key={s.label} className={s.done ? 'done' : s.now ? 'now' : ''}>
              <span>{s.done ? '✓' : i + 1}</span>
              {s.label}
            </li>
          ))}
        </ol>
      </div>
    </aside>
  );
}

export default function CasePage() {
  const { caseId = '' } = useParams();
  const [pov, setPov] = usePov();
  const [c, setC] = useState<CaseDetail | null>(null);
  const [tab, setTab] = useState<Tab>('ledger');
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const tabTrack = useSlidingPill<HTMLDivElement>("[aria-selected='true']", `${pov}:${tab}:${c?.status}`);

  useEffect(() => {
    api
      .case(caseId)
      .then((d) => {
        setC(d);
        setTab(defaultTab(pov, d.status));
      })
      .catch((e: Error) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  useEffect(() => {
    if (c) setTab(defaultTab(pov, c.status));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pov]);

  function update(next: CaseDetail) {
    if (c && next.status !== c.status && next.status !== 'PUBLISHED') setTab(defaultTab(pov, next.status));
    setC(next);
  }

  async function retry() {
    setRetrying(true);
    try {
      update(await api.retry(caseId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRetrying(false);
    }
  }

  if (error && !c) return <p className="note error">{error}</p>;
  if (!c) return <p className="muted">Loading…</p>;

  const tabs = tabsFor(pov, c);
  const current = tabs.some((t) => t.key === tab) ? tab : tabs[0].key;
  const name = firstName(c.person.name);
  const notPublished = pov === 'newhire' && c.status !== 'PUBLISHED';

  return (
    <div className={`case pov-is-${pov}`}>
      <Rail key={`rail-${pov}`} c={c} pov={pov} />

      <section>
        <PovSwitch c={c} pov={pov} setPov={setPov} />
        <div className="fx" key={`sum-${pov}`}><Summary c={c} pov={pov} /></div>

        {c.status === 'FAILED' && pov === 'manager' && (
          <div className="note error" style={{ marginBottom: 20 }}>
            <span>{c.errorMessage ?? 'The interview could not start.'}</span>
            <button className="btn quiet" onClick={retry} disabled={retrying}>
              {retrying && <Spinner />} Retry
            </button>
          </div>
        )}
        {c.status !== 'FAILED' && c.errorMessage && pov === 'manager' && (
          <p className="note" style={{ marginBottom: 20 }}>
            {c.errorMessage}
          </p>
        )}

        {notPublished ? (
          <div className="waiting">
            <h2>{name}&apos;s handover is still being prepared</h2>
            <p className="muted">
              {name} is {c.status === 'INTERVIEWING' ? 'answering the interview' : 'reviewing the pack'}.{' '}
              {c.person.managerName ?? 'Your manager'} publishes it before your first day, and your onboarding kit appears
              here at the same time.
            </p>
          </div>
        ) : (
          <>
            <div className="tabs slide" ref={tabTrack} role="tablist">
              {tabs.map((t) => (
                <button key={t.key} role="tab" aria-selected={current === t.key} disabled={t.disabled} onClick={() => setTab(t.key)}>
                  {t.label}
                </button>
              ))}
            </div>

            <div className="fx" key={`${pov}-${current}`}>
            {current === 'ledger' && <CoverageTab c={c} onChange={update} pov={pov} />}
            {current === 'interview' && <InterviewTab c={c} onChange={update} pov={pov} onSwitch={() => setPov('leaver')} />}
            {current === 'pack' && <PackTab c={c} onChange={update} pov={pov} />}
            {current === 'ask' && <AskTab key={c.id} c={c} />}
            {current === 'backfill' && <BackfillTab c={c} onChange={update} />}
            {current === 'onboarding' && <OnboardingTab c={c} onChange={update} pov={pov} />}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
