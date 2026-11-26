import { useState } from 'react';
import { api } from '../api';
import type { CaseDetail, Item } from '../types';
import type { Pov } from '../pov';
import { State, itemState, type ItemState } from './ui';

const KIND: Record<string, string> = {
  recurring_task: 'Recurring duty',
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
          <input className="field" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Monthly vendor invoice sign-off" />
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
        What should the successor know? <span className="faint">(optional, the interview will ask anyway)</span>
        <textarea className="field" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Runs on the 1st; Finance chases it by the 3rd." />
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
          <button type="button" className="btn quiet" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" disabled={busy}>
            Add to the map
          </button>
        </div>
      </div>
      {error && <p className="note error">{error}</p>}
    </form>
  );
}

const ORDER: ItemState[] = ['risk', 'owner', 'captured', 'documented', 'low'];

/** One or two short reasons, most important first. */
function why(item: Item): string {
  const reasons: string[] = [];
  if (item.needsReassignment) reasons.push('Stops working when their account closes');
  else if (item.kind === 'recurring_task') reasons.push('Recurring duty with nobody else on it');
  if (!item.hasDocs && item.kind !== 'doc') reasons.push('No runbook');
  if (reasons.length < 2 && item.activity >= 10) reasons.push(`${item.activity} changes recently`);
  if (reasons.length === 0) reasons.push(item.hasDocs ? 'Already written down' : 'Rarely touched');
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
      placeholder={item.needsReassignment ? 'Add a name' : 'Optional'}
      value={value}
      disabled={saving}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      aria-label={`New owner for ${item.title}`}
    />
  );
}

export default function CoverageTab({ c, onChange, pov }: { c: CaseDetail; onChange: (c: CaseDetail) => void; pov: Pov }) {
  const self = pov === 'leaver';
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const name = c.person.name.split(' ')[0];

  async function dismiss(item: Item) {
    setRemoving(item.id);
    try {
      onChange(await api.dismissItem(c.id, item.id));
    } finally {
      setRemoving(null);
    }
  }

  const header = (
    <div className="map-head">
      <div>
        <h2>{self ? 'Is this everything you own?' : `Is this everything ${name} owns?`}</h2>
        <p className="small muted">
          {self
            ? 'Found in your repositories, tickets and documents. Remove anything that isn\u2019t yours and add what the tools can\u2019t see, like the favours people quietly rely on you for.'
            : `Found automatically in connected tools. Remove anything that isn\u2019t ${name}\u2019s and add what the tools can\u2019t see.`}
        </p>
      </div>
      {!adding && (
        <button className="btn" onClick={() => setAdding(true)}>
          Add something
        </button>
      )}
    </div>
  );

  if (c.items.length === 0) {
    return (
      <div>
        {header}
        {adding && <AddItem c={c} onChange={onChange} onClose={() => setAdding(false)} />}
        <p className="muted">Nothing was found in the connected tools. Add what {name} owns by hand.</p>
      </div>
    );
  }
  const items = [...c.items].sort(
    (a, b) => ORDER.indexOf(itemState(a)) - ORDER.indexOf(itemState(b)) || (b.riskScore ?? 0) - (a.riskScore ?? 0),
  );
  return (
    <div>
      {header}
      {adding && <AddItem c={c} onChange={onChange} onClose={() => setAdding(false)} />}
    <div className="sheet" style={{ overflowX: 'auto' }}>
      <table className="ledger">
        <thead>
          <tr>
            <th>What</th>
            <th>Why it matters</th>
            <th>State</th>
            <th>{self ? 'Goes to' : 'New owner'}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const state = itemState(item);
            return (
              <tr key={item.id}>
                <td className="what">
                  {item.url ? (
                    <a href={item.url} target="_blank" rel="noreferrer">
                      <b>{item.title}</b>
                    </a>
                  ) : (
                    <b>{item.title}</b>
                  )}
                  <div className="src">
                    {item.origin === 'manual'
                      ? `${KIND[item.kind] ?? item.kind}, added by ${item.addedBy ?? 'hand'}`
                      : `${KIND[item.kind] ?? item.kind} in ${SOURCE[item.source] ?? item.source}`}
                  </div>
                  {item.ownershipShare !== null && (
                    <div className="share">
                      <span className="meter">
                        <b style={{ width: `${Math.round(item.ownershipShare * 100)}%` }} />
                      </span>
                      Wrote {Math.round(item.ownershipShare * 100)}% of recent changes
                    </div>
                  )}
                </td>
                <td className="why">{why(item)}</td>
                <td>
                  <State state={state} />
                </td>
                <td>
                  {self ? (
                    <span className={item.successor ? 'small' : 'small faint'}>
                      {item.successor ?? (item.needsReassignment ? 'Your manager decides' : 'Not needed')}
                    </span>
                  ) : (
                    <OwnerField caseId={c.id} item={item} onChange={onChange} />
                  )}
                  <button className="link-btn small not-theirs" onClick={() => dismiss(item)} disabled={removing === item.id}>
                    {self ? 'Not mine' : `Not ${name}\u2019s`}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    </div>
  );
}
