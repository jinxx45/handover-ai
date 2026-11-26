import type { CaseStatus, Item } from '../types';

/** One state per owned item. Colour in the UI only ever encodes this. */
export type ItemState = 'risk' | 'owner' | 'captured' | 'documented' | 'low';

export function itemState(i: Item): ItemState {
  if (i.needsReassignment && !i.successor) return 'owner';
  if (i.coverage === 'INTERVIEWED' || (i.needsReassignment && i.successor)) return 'captured';
  if (i.coverage === 'DOCUMENTED') return 'documented';
  if (i.needsInterview) return 'risk';
  return 'low';
}

export const STATE_LABEL: Record<ItemState, string> = {
  risk: 'At risk',
  owner: 'Needs a new owner',
  captured: 'Captured',
  documented: 'Documented',
  low: 'Low risk',
};

const ORDER: ItemState[] = ['risk', 'owner', 'captured', 'documented', 'low'];

/** Legend wording with a count: "1 needs a new owner", "3 need a new owner". */
export function countLabel(state: ItemState, n: number): string {
  if (state === 'owner') return `${n} ${n === 1 ? 'needs' : 'need'} a new owner`;
  return `${n} ${STATE_LABEL[state].toLowerCase()}`;
}

export function State({ state, children }: { state: ItemState; children?: React.ReactNode }) {
  return <span className={`state s-${state}`}>{children ?? STATE_LABEL[state]}</span>;
}

/** The ownership strip: one block per owned item, grouped by state. */
export function Strip({ items, large = false }: { items: Item[]; large?: boolean }) {
  const sorted = [...items].sort((a, b) => ORDER.indexOf(itemState(a)) - ORDER.indexOf(itemState(b)));
  const counts = ORDER.map((s) => [s, items.filter((i) => itemState(i) === s).length] as const).filter(([, n]) => n);
  return (
    <div>
      <div
        className={`strip ${large ? 'lg' : ''}`}
        role="img"
        aria-label={counts.map(([s, n]) => countLabel(s, n)).join(', ')}
      >
        {sorted.map((i, idx) => (
          <i key={i.id} className={itemState(i)} title={`${i.title}: ${STATE_LABEL[itemState(i)]}`} style={large ? { animationDelay: `${idx * 35}ms` } : undefined} />
        ))}
      </div>
      {large && (
        <div className="legend small">
          {counts.map(([s, n]) => (
            <State key={s} state={s}>
              {countLabel(s, n)}
            </State>
          ))}
        </div>
      )}
    </div>
  );
}

/** Notice period from the day the case opened to the last day, with today marked. */
export function Runway({ start, lastDay }: { start: string; lastDay: string | null }) {
  if (!lastDay) return null;
  const s = new Date(start).getTime();
  const e = new Date(`${lastDay}T23:59:59`).getTime();
  const pct = Math.max(0, Math.min(100, ((Date.now() - s) / Math.max(1, e - s)) * 100));
  return (
    <div className="runway" aria-hidden="true">
      <b style={{ width: `${pct}%` }} />
      <em style={{ left: `calc(${pct}% - 1px)` }} />
    </div>
  );
}

const STEPS: { key: CaseStatus; label: string }[] = [
  { key: 'MAPPING', label: 'Map what they own' },
  { key: 'INTERVIEWING', label: 'Interview' },
  { key: 'REVIEW', label: 'Review the pack' },
  { key: 'PUBLISHED', label: 'Published' },
];

export function Steps({ status }: { status: CaseStatus }) {
  const idx = status === 'FAILED' ? 0 : STEPS.findIndex((s) => s.key === status);
  return (
    <ol className="steps">
      {STEPS.map((s, i) => {
        const done = i < idx || status === 'PUBLISHED';
        return (
          <li key={s.key} className={done ? 'done' : i === idx ? 'now' : ''}>
            <span>{done ? '✓' : i + 1}</span>
            {s.label}
          </li>
        );
      })}
    </ol>
  );
}

export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'not set';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function daysLeftLabel(days: number | null): string {
  if (days === null) return 'No last day';
  if (days < 0) return `Left ${-days} days ago`;
  if (days === 0) return 'Last day today';
  return `${days} ${days === 1 ? 'day' : 'days'} left`;
}

export function firstName(name: string) {
  return name.split(' ')[0];
}
