import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import AskTab from '../components/AskTab';
import BackfillTab from '../components/BackfillTab';
import CoverageTab from '../components/CoverageTab';
import InterviewTab from '../components/InterviewTab';
import OnboardingTab from '../components/OnboardingTab';
import PackTab from '../components/PackTab';
import { Runway, Spinner, firstName, formatDate } from '../components/ui';
import { usePov, type Pov } from '../pov';
import type { CaseDetail, CaseStatus } from '../types';

export type Tab = 'ledger' | 'interview' | 'pack' | 'ask' | 'backfill' | 'onboarding';

/** Which tabs each person sees. The leaver's are a real sequence, so they render as numbered steps. */
function tabsFor(pov: Pov, c: CaseDetail): { key: Tab; label: string; disabled?: boolean; done?: boolean }[] {
  const name = firstName(c.person.name);
  if (pov === 'leaver') {
    return [
      { key: 'ledger', label: 'What you own', done: c.status !== 'MAPPING' },
      { key: 'interview', label: 'Interview', done: c.status === 'REVIEW' || c.status === 'PUBLISHED' },
      { key: 'pack', label: 'Your pack', disabled: !c.pack, done: c.status === 'PUBLISHED' },
    ];
  }
  if (pov === 'newhire') {
    return [
      { key: 'onboarding', label: 'Your first 90 days' },
      { key: 'ask', label: `Ask ${name}’s handover` },
      { key: 'pack', label: 'Handover pack' },
    ];
  }
  return [
    { key: 'ledger', label: 'What they own' },
    { key: 'interview', label: `Interview${c.turns.length ? ` (${c.turns.length})` : ''}` },
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

/** Demo-only control for switching whose eyes the case is seen through. Floats apart from the product UI. */
function DemoBar({ c, pov, setPov }: { c: CaseDetail; pov: Pov; setPov: (p: Pov) => void }) {
  const initials = (s: string) =>
    s
      .split(' ')
      .map((w) => w[0])
      .slice(0, 2)
      .join('');
  const options: { key: Pov; who: string; role: string; av: string }[] = [
    { key: 'leaver', who: firstName(c.person.name), role: 'Leaving', av: initials(c.person.name) },
    { key: 'manager', who: firstName(c.person.managerName ?? 'Manager'), role: 'Manager', av: initials(c.person.managerName ?? 'M') },
    { key: 'newhire', who: 'New hire', role: 'Taking over', av: '+' },
  ];
  return (
    <div className="demobar" role="group" aria-label="Demo: view this handover as">
      <span className="dl">View as</span>
      {options.map((o) => (
        <button key={o.key} aria-pressed={pov === o.key} onClick={() => setPov(o.key)}>
          <span className="av" aria-hidden="true">
            {o.av}
          </span>
          {o.who}
          <span className="role">{o.role}</span>
        </button>
      ))}
    </div>
  );
}

export default function CasePage() {
  const { caseId = '' } = useParams();
  const [pov, setPov] = usePov();
  const [c, setC] = useState<CaseDetail | null>(null);
  const [tab, setTab] = useState<Tab>('ledger');
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

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
  if (!c) return <p className="empty">Loading…</p>;

  const tabs = tabsFor(pov, c);
  const current = tabs.some((t) => t.key === tab && !t.disabled) ? tab : tabs.find((t) => !t.disabled)!.key;
  const name = firstName(c.person.name);
  const manager = c.person.managerName ?? 'your manager';
  const notPublished = pov === 'newhire' && c.status !== 'PUBLISHED';
  const days = c.person.daysLeft;

  const title = { leaver: 'Your handover', manager: c.person.name, newhire: `Taking over from ${name}` }[pov];
  const sub = {
    leaver: `${c.person.role ?? ''}. Your manager is ${manager}.`,
    manager: `${c.person.role ?? ''}. Reports to you.`,
    newhire: `${c.person.role ?? ''}. Your manager is ${manager}.`,
  }[pov];

  return (
    <div className="case">
      <Link to="/departures" className="crumb">
        Departures
      </Link>
      <header className="chead">
        <div>
          <h1>{title}</h1>
          <p className="csub">{sub}</p>
        </div>
        {days !== null && (
          <div className="clock" aria-label={`${days} days left, last day ${formatDate(c.person.lastDay)}`}>
            <b>{Math.max(days, 0)}</b>
            <span>
              {days === 1 ? 'day left' : 'days left'}
              <small>Last day {formatDate(c.person.lastDay)}</small>
            </span>
            <Runway start={c.createdAt} lastDay={c.person.lastDay} />
          </div>
        )}
      </header>

      {!notPublished &&
        (pov === 'leaver' ? (
          <ol className="steps-nav">
            {tabs.map((t, i) => (
              <li key={t.key} className={`${current === t.key ? 'on' : ''} ${t.done ? 'done' : ''}`}>
                <button disabled={t.disabled} aria-current={current === t.key ? 'step' : undefined} onClick={() => setTab(t.key)}>
                  <span className="n">{t.done && current !== t.key ? '✓' : i + 1}</span>
                  {t.label}
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <div className="utabs" role="tablist">
            {tabs.map((t) => (
              <button key={t.key} role="tab" aria-selected={current === t.key} disabled={t.disabled} onClick={() => setTab(t.key)}>
                {t.label}
              </button>
            ))}
          </div>
        ))}

      <div className="cbody">
        {c.status === 'FAILED' && pov === 'manager' && (
          <div className="note error">
            <span>{c.errorMessage ?? 'The interview could not start.'}</span>
            <button className="btn quiet" onClick={retry} disabled={retrying}>
              {retrying && <Spinner />} Retry
            </button>
          </div>
        )}
        {c.status !== 'FAILED' && c.errorMessage && pov === 'manager' && <p className="note">{c.errorMessage}</p>}

        {notPublished ? (
          <div className="waiting fx">
            <h2>{name}&rsquo;s handover is still being prepared</h2>
            <p className="muted" style={{ marginTop: 8 }}>
              {name} is {c.status === 'INTERVIEWING' ? 'answering the interview' : 'reviewing the pack'}. {c.person.managerName ?? 'Your manager'}{' '}
              publishes it before your first day, and your onboarding kit appears here at the same time.
            </p>
          </div>
        ) : (
          <div className="fx" key={`${pov}-${current}`}>
            {current === 'ledger' && <CoverageTab c={c} onChange={update} pov={pov} onTab={setTab} />}
            {current === 'interview' && <InterviewTab c={c} onChange={update} pov={pov} onSwitch={() => setPov('leaver')} />}
            {current === 'pack' && <PackTab c={c} onChange={update} pov={pov} />}
            {current === 'ask' && <AskTab key={c.id} c={c} />}
            {current === 'backfill' && <BackfillTab c={c} onChange={update} />}
            {current === 'onboarding' && <OnboardingTab c={c} onChange={update} pov={pov} />}
          </div>
        )}
      </div>

      <DemoBar c={c} pov={pov} setPov={setPov} />
    </div>
  );
}
