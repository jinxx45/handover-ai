import { useState } from 'react';
import { api } from '../api';
import type { CaseDetail, Item } from '../types';
import type { Pov } from '../pov';
import type { Tab } from '../pages/CasePage';
import { State, Strip, firstName, formatDate, itemState, type ItemState } from './ui';

const KIND: Record<string, string> = {
  recurring_task: 'Regular task',
  service: 'Service',
  repo: 'Repository',
  customer: 'Customer',
  ticket_queue: 'Open tickets',
  ticket: 'Ticket',
  doc: 'Documents',
  contact: 'Key contact',
  approval: 'Approval',
  oncall: 'On-call',
  other: 'Other',
};

const SOURCE: Record<string, string> = {
  github: 'GitHub',
  jira: 'Jira',
  confluence: 'Confluence',
  'google-drive': 'Google Drive',
  drive: 'Google Drive',
  calendar: 'Calendar',
  pagerduty: 'PagerDuty',
  workday: 'Workday',
  crm: 'CRM',
  manual: 'by hand',
};

const ADD_KINDS: [string, string][] = [
  ['approval', 'An approval or sign-off'],
  ['recurring_task', 'A recurring duty'],
  ['service', 'A system or service'],
  ['customer', 'A customer or partner'],
  ['oncall', 'An on-call or escalation role'],
  ['contact', 'A key relationship'],
  ['other', 'Something else'],
];

function AddItem({ c, onChange, onClose }: { c: CaseDetail; onChange: (c: CaseDetail) => void; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState('approval');
  const [notes, setNotes] = useState('');
  const [reassign, setReassign] = useState(true);
  const [addedBy, setAddedBy] = useState(c.person.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Say what it is first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onChange(await api.addItem(c.id, { title: title.trim(), kind, notes, needsReassignment: reassign, addedBy }));
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form className="add-form" onSubmit={save}>
      <div className="add-grid">
        <label>
          What is it?
          <input className="field" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Monthly Workday report for Finance" />
        </label>
        <label>
          Kind
          <select className="field" value={kind} onChange={(e) => setKind(e.target.value)}>
            {ADD_KINDS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        What should the next person know? <span className="faint">(optional, the interview will ask too)</span>
        <textarea className="field" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Runs on the 1st. Finance asks for it by the 3rd." />
      </label>
      <label className="check">
        <input type="checkbox" checked={reassign} onChange={(e) => setReassign(e.target.checked)} />
        It stops working when their account closes, so it needs a new owner
      </label>
      <div className="add-foot">
        <label className="inline">
          Added by
          <input className="field" style={{ width: 200 }} value={addedBy} onChange={(e) => setAddedBy(e.target.value)} />
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" disabled={busy}>
            Add it
          </button>
        </div>
      </div>
      {error && <p className="note error">{error}</p>}
    </form>
  );
}

/** One or two short reasons, most important first. */
function why(item: Item, self: boolean): string {
  const reasons: string[] = [];
  if (item.needsReassignment) reasons.push(self ? 'Stops working when your account closes' : 'Stops working when their account closes');
  else if (item.kind === 'recurring_task') reasons.push('Regular task that nobody else does');
  if (!item.hasDocs && ['service', 'repo', 'recurring_task', 'oncall'].includes(item.kind)) reasons.push('No runbook');
  if (reasons.length < 2 && item.activity >= 10 && ['service', 'repo'].includes(item.kind)) reasons.push(`${item.activity} changes recently`);
  if (reasons.length === 0) return '';
  return reasons.slice(0, 2).join('. ') + '.';
}

function OwnerField({ caseId, item, onChange }: { caseId: string; item: Item; onChange: (c: CaseDetail) => void }) {
  const [value, setValue] = useState(item.successor ?? '');
  const [saving, setSaving] = useState(false);
  async function save() {
    if ((item.successor ?? '') === value.trim()) return;
    setSaving(true);
    try {
      onChange(await api.assign(caseId, item.id, value.trim()));
    } finally {
      setSaving(false);
    }
  }
  return (
    <input
      className={`field owner-field ${item.needsReassignment && !item.successor ? 'missing' : ''}`}
      placeholder={item.needsReassignment ? 'Choose someone' : 'Optional'}
      value={value}
      disabled={saving}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      aria-label={`New owner for ${item.title}`}
    />
  );
}

/** Groups items by where they came from, so people can check one tool at a time. */
type Category = { key: string; title: string; note: string };
function categoryOf(i: Item): Category {
  if (i.origin === 'manual') return { key: 'manual', title: 'Added by hand', note: 'Things the tools could not see.' };
  if (i.kind === 'oncall') return { key: 'oncall', title: 'On-call', note: 'Rotations in PagerDuty.' };
  switch (i.source) {
    case 'github':
      return { key: 'code', title: 'Code', note: 'Repositories, releases and code reviews in GitHub.' };
    case 'jira':
      return i.kind === 'approval'
        ? { key: 'jira-approvals', title: 'Jira approvals', note: 'Requests in Jira that wait for this person to approve.' }
        : { key: 'jira', title: 'Jira tickets', note: 'Open work assigned in Jira.' };
    case 'confluence':
    case 'google-drive':
    case 'drive':
      return { key: 'docs', title: 'Documentation and files', note: 'Pages in Confluence and files in Google Drive.' };
    case 'workday':
      return { key: 'workday', title: 'Workday', note: 'Approvals, reports and payroll tasks in Workday.' };
    case 'calendar':
      return { key: 'meetings', title: 'Meetings and people', note: 'Regular meetings from Calendar.' };
    case 'pagerduty':
      return { key: 'oncall', title: 'On-call', note: 'Rotations in PagerDuty.' };
    default:
      return { key: 'other', title: 'Other', note: '' };
  }
}
const CATEGORY_ORDER = ['code', 'jira-approvals', 'jira', 'workday', 'oncall', 'docs', 'meetings', 'other', 'manual'];

/** In the leaver's own view, "assigned to Elena" reads "assigned to you". */
export function forViewer(text: string, name: string, self: boolean): string {
  return self ? text.replace(new RegExp(`\\b(to|for|by|of) ${name}\\b`, 'g'), '$1 you') : text;
}

function NextCard({ c, pov, onTab }: { c: CaseDetail; pov: Pov; onTab: (t: Tab) => void }) {
  const name = firstName(c.person.name);
  const need = c.items.filter((i) => itemState(i) === 'owner').length;
  const card = (title: string, body: string, cta?: string, tab?: Tab) => (
    <div className="acard">
      <h3>{title}</h3>
      <p>{body}</p>
      {cta && tab && (
        <button className="btn" onClick={() => onTab(tab)}>
          {cta}
        </button>
      )}
    </div>
  );
  if (pov === 'leaver') {
    if (c.status === 'MAPPING') return card('Next: the interview', 'Check this list first. The interview starts once the list is ready.');
    if (c.status === 'INTERVIEWING') {
      const left = (c.currentQuestion?.remaining ?? 0) + 1;
      return card(
        c.turns.length ? 'Continue the interview' : 'Next: the interview',
        `${left} ${left === 1 ? 'topic' : 'topics'} left, most important first. Type, speak, or record your screen. About ${Math.max(5, left * 4)} minutes.`,
      );
    }
    if (c.status === 'REVIEW') return card('Your handover notes are ready', `Read them and point out anything wrong or private before ${c.person.managerName ?? 'your manager'} publishes them.`, 'Read your notes', 'pack');
    if (c.status === 'PUBLISHED') return card('Your handover is published', 'Thank you. The next person can now ask it questions instead of messaging you.');
    return card('Something went wrong', `${c.person.managerName ?? 'Your manager'} has been asked to retry.`);
  }
  if (need) {
    return card(
      `${need} ${need === 1 ? 'thing needs' : 'things need'} an owner`,
      `Name someone for each before ${formatDate(c.person.lastDay)}. Then publish the notes.`,
      c.pack ? 'Go to the notes' : 'Follow the interview',
      c.pack ? 'pack' : 'interview',
    );
  }
  if (c.status === 'REVIEW') return card('Everything has an owner', 'The handover notes are ready for you to publish.', 'Go to the notes', 'pack');
  if (c.status === 'PUBLISHED') return card('Published', `The new hire can use ${name}\u2019s handover now.`, 'See the 90-day plan', 'onboarding');
  return card('Everything has an owner', `Waiting for ${name} to finish the interview.`, 'Follow the interview', 'interview');
}

function Sources({ c }: { c: CaseDetail }) {
  const counts = new Map<string, number>();
  for (const i of c.items) {
    const k = i.origin === 'manual' ? 'Added by hand' : SOURCE[i.source] ?? i.source;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return (
    <ul className="sources" aria-label="Where the map came from">
      {[...counts.entries()].map(([k, n]) => (
        <li key={k}>
          <span>{k}</span>
          <span className="num">{n}</span>
        </li>
      ))}
    </ul>
  );
}

export default function CoverageTab({ c, onChange, pov, onTab }: { c: CaseDetail; onChange: (c: CaseDetail) => void; pov: Pov; onTab: (t: Tab) => void }) {
  const self = pov === 'leaver';
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const name = firstName(c.person.name);

  async function dismiss(item: Item) {
    setRemoving(item.id);
    try {
      onChange(await api.dismissItem(c.id, item.id));
    } finally {
      setRemoving(null);
    }
  }

  const tools = [...new Set(c.items.filter((i) => i.origin !== 'manual').map((i) => SOURCE[i.source] ?? i.source))];
  const found = tools.length ? `Found in ${tools.length > 1 ? `${tools.slice(0, -1).join(', ')} and ${tools[tools.length - 1]}` : tools[0]}.` : 'Nothing was found in the connected tools.';
  const byKey = new Map<string, Category & { items: Item[] }>();
  for (const i of c.items) {
    const cat = categoryOf(i);
    if (!byKey.has(cat.key)) byKey.set(cat.key, { ...cat, items: [] });
    byKey.get(cat.key)!.items.push(i);
  }
  const groups = [...byKey.values()]
    .sort((a, b) => CATEGORY_ORDER.indexOf(a.key) - CATEGORY_ORDER.indexOf(b.key))
    .map((g) => ({ ...g, items: g.items.sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0)) }));
  const leaverCanStart = self && c.status === 'INTERVIEWING';

  const row = (item: Item, state: ItemState = itemState(item)) => (
    <li className="oi" key={item.id}>
      <div className="ot">
        {item.url ? (
          <a href={item.url} target="_blank" rel="noreferrer">
            <b>{forViewer(item.title, name, self)}</b>
          </a>
        ) : (
          <b>{forViewer(item.title, name, self)}</b>
        )}
        <span className="src">
          {item.origin === 'manual' ? `${KIND[item.kind] ?? item.kind}, added by ${item.addedBy ?? 'hand'}` : `${KIND[item.kind] ?? item.kind} in ${SOURCE[item.source] ?? item.source}`}
        </span>
      </div>
      <p className="or">
        <State state={state} /> {why(item, self)}
      </p>
      {item.ownershipShare !== null && (
        <div className="share">
          <span className="meter">
            <b style={{ width: `${Math.round(item.ownershipShare * 100)}%` }} />
          </span>
          {self ? 'You wrote' : 'Wrote'} {Math.round(item.ownershipShare * 100)}% of recent changes
        </div>
      )}
      <div className="oa">
        {pov === 'manager' && item.needsReassignment && <OwnerField caseId={c.id} item={item} onChange={onChange} />}
        {pov !== 'manager' && item.successor && <span className="who">Goes to {item.successor}</span>}
        {state === 'captured' && !item.successor && <span className="who ok">{self ? 'Explained in your interview' : 'Explained in the interview'}</span>}
        {pov !== 'newhire' && (
          <button className="link-btn not-theirs" onClick={() => dismiss(item)} disabled={removing === item.id}>
            {self ? 'Not mine' : `Not ${name}\u2019s`}
          </button>
        )}
      </div>
    </li>
  );

  return (
    <div className="olayout">
      <div>
        <h2 className="oh">{self ? 'Is this everything that\u2019s yours?' : pov === 'manager' ? `What ${name} owns` : `What ${name} owned`}</h2>
        <p className="olede">
          {found}
          {pov !== 'newhire' && (self ? ' Remove anything that isn\u2019t yours and add what the tools can\u2019t see, like favours people rely on you for.' : ` Remove anything that isn\u2019t ${name}\u2019s and add what the tools can\u2019t see.`)}
        </p>

        {leaverCanStart && (
          <div className="confirm">
            <div>
              <b>Is everything correct?</b>
              <span>Remove what isn&rsquo;t yours with &ldquo;Not mine&rdquo;, add anything missing below, then start the interview.</span>
            </div>
            <button className="btn" onClick={() => onTab('interview')}>
              {c.turns.length ? 'Continue the interview' : 'Looks right. Start the interview'}
            </button>
          </div>
        )}

        {groups.map((g) => (
          <section className="og" key={g.key}>
            <header>
              <h3>
                {g.title}
                <span className="cnt">{g.items.length}</span>
              </h3>
              {g.note && <p>{g.note}</p>}
            </header>
            <ul>{g.items.map((i) => row(i))}</ul>
          </section>
        ))}

        {pov !== 'newhire' && (
          <div className="oadd">
            {adding ? (
              <AddItem c={c} onChange={onChange} onClose={() => setAdding(false)} />
            ) : (
              <button className="addbtn" onClick={() => setAdding(true)}>
                <span aria-hidden="true">+</span>
                Add something the tools missed
              </button>
            )}
          </div>
        )}
      </div>

      <aside className="oside">
        {pov !== 'newhire' && <NextCard c={c} pov={pov} onTab={onTab} />}
        {c.items.length > 0 && (
          <div className="mstrip">
            <Strip items={c.items} large />
          </div>
        )}
        {pov === 'manager' && <Sources c={c} />}
      </aside>
    </div>
  );
}
