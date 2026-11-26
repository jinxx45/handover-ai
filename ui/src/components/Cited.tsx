import ReactMarkdown from 'react-markdown';
import type { EvidenceView, Pack, Turn } from '../types';

export interface Sources {
  evidence: EvidenceView[];
  turns: Turn[];
  pack: Pack | null;
}

const CITE_RE = /\[((?:E|I|S)\d+)\]/g;

const TOOL: Record<string, string> = {
  github: 'GitHub', jira: 'Jira', confluence: 'Confluence', 'google-drive': 'Google Drive', drive: 'Google Drive',
  calendar: 'Calendar', pagerduty: 'PagerDuty', workday: 'Workday', crm: 'CRM', manual: 'Added by hand',
};

function describe(id: string, sources: Sources): { title: string; text: string } {
  if (id.startsWith('E')) {
    const e = sources.evidence.find((x) => x.label === id);
    return e ? { title: `From ${TOOL[e.source] ?? e.source}`, text: e.text } : { title: 'Source', text: 'Source not found.' };
  }
  if (id.startsWith('I')) {
    const t = sources.turns.find((x) => x.label === id);
    return t
      ? { title: 'Interview answer', text: `Q: ${t.question}\nA: ${t.answer}` }
      : { title: 'Interview', text: 'Answer not found.' };
  }
  const n = Number(id.slice(1)) - 1;
  const s = sources.pack?.sections[n];
  return s ? { title: `Handover notes: ${s.heading}`, text: s.body.slice(0, 400) } : { title: 'Handover notes', text: 'Section not found.' };
}

export function Cite({ id, sources }: { id: string; sources: Sources }) {
  const d = describe(id, sources);
  return (
    <button type="button" className={`cite cite-${id[0]}`} aria-label={`${d.title}: ${d.text}`}>
      {id}
      <span className="pop" role="tooltip">
        <b>{d.title}</b>
        <span style={{ whiteSpace: 'pre-wrap' }}>{d.text}</span>
      </span>
    </button>
  );
}

/** Markdown with [E3]/[I1]/[S2] markers turned into hoverable source chips. */
export function CitedMarkdown({ text, sources }: { text: string; sources: Sources }) {
  const withLinks = text.replace(CITE_RE, (_m, id: string) => `[${id}](#cite-${id})`);
  return (
    <ReactMarkdown
      components={{
        a: ({ href, children }) => {
          if (href?.startsWith('#cite-')) return <Cite id={href.slice(6)} sources={sources} />;
          return (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          );
        },
      }}
    >
      {withLinks}
    </ReactMarkdown>
  );
}

/** Plain text (no markdown) with citation chips; used for Q&A answers. */
export function CitedText({ text, sources }: { text: string; sources: Sources }) {
  const parts = text.split(CITE_RE);
  return (
    <>
      {parts.map((p, i) => (i % 2 === 1 ? <Cite key={i} id={p} sources={sources} /> : <span key={i}>{p}</span>))}
    </>
  );
}
