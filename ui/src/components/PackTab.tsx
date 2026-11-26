import { useState } from 'react';
import { api } from '../api';
import type { Pov } from '../pov';
import type { CaseDetail } from '../types';
import { AttachmentList } from './Attachments';
import { CitedMarkdown, type Sources } from './Cited';
import { Spinner, firstName, formatDate } from './ui';

export default function PackTab({ c, onChange, pov }: { c: CaseDetail; onChange: (c: CaseDetail) => void; pov: Pov }) {
  const [approver, setApprover] = useState(c.person.managerName ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!c.pack) {
    return <p className="muted">The pack is written when the interview ends.</p>;
  }
  const sources: Sources = { evidence: c.evidence, turns: c.turns, pack: c.pack };
  const name = firstName(c.person.name);

  async function publish() {
    setBusy(true);
    setError(null);
    try {
      onChange(await api.approve(c.id, approver.trim()));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {c.status === 'REVIEW' && pov === 'leaver' && (
        <div className="approve">
          <div>
            <h3>Check your notes before they&rsquo;re shared</h3>
            <p className="small muted" style={{ marginTop: 4, maxWidth: '60ch' }}>
              These notes come from your answers and your work. If anything is wrong or private, tell{' '}
              {c.person.managerName ?? 'your manager'} before they publish. You can still add a recording or link
              in the Interview step.
            </p>
          </div>
        </div>
      )}
      {c.status === 'REVIEW' && pov === 'manager' && (
        <div className="approve">
          <div>
            <h3>Check and publish</h3>
            <p className="small muted" style={{ marginTop: 4, maxWidth: '56ch' }}>
              {name} checks the notes first. Then you publish them for the person taking over.
              {c.stats.toReassign > 0 &&
                ` ${c.stats.toReassign} ${c.stats.toReassign === 1 ? 'task still has' : 'tasks still have'} no new owner. You can publish now and name owners before the last day.`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div>
              <label htmlFor="approver">Published by</label>
              <input id="approver" className="field" style={{ width: 180 }} value={approver} onChange={(e) => setApprover(e.target.value)} />
            </div>
            <button className="btn" onClick={publish} disabled={busy || !approver.trim()}>
              {busy && <Spinner />} Publish
            </button>
          </div>
        </div>
      )}
      {c.status === 'PUBLISHED' && (
        <p className="note done" style={{ marginBottom: 16 }}>
          Published by {c.approvedBy} on {formatDate(c.approvedAt)}.
        </p>
      )}
      {error && (
        <p className="note error" style={{ marginBottom: 16 }}>
          {error}
        </p>
      )}

      <div className="pack">
        <ul className="toc">
          {c.pack.sections.map((s) => (
            <li key={s.key}>
              <a href={`#sec-${s.key}`}>{s.heading}</a>
            </li>
          ))}
          {c.attachments.length > 0 && (
            <li>
              <a href="#sec-recordings">Recordings and links</a>
            </li>
          )}
          <li className="faint" style={{ marginTop: 16, fontSize: 12.5, lineHeight: 1.5 }}>
            Small marks like <span className="cite" style={{ verticalAlign: 'baseline' }}>E4</span> link each fact to its
            source. Hover one to read it.
          </li>
        </ul>
        <article className="doc">
          <h1>{c.pack.title}</h1>
          <p className="standfirst">{c.pack.summary}</p>
          {c.pack.sections.map((s) => (
            <section key={s.key} id={`sec-${s.key}`}>
              <h2>{s.heading}</h2>
              <div className="body">
                <CitedMarkdown text={s.body} sources={sources} />
              </div>
            </section>
          ))}
          {c.attachments.length > 0 && (
            <section id="sec-recordings">
              <h2>Recordings and links</h2>
              {c.items
                .filter((i) => c.attachments.some((a) => a.itemId === i.id))
                .map((i) => (
                  <div key={i.id} className="rec-group">
                    <h3>{i.title}</h3>
                    <AttachmentList items={c.attachments.filter((a) => a.itemId === i.id)} c={c} />
                  </div>
                ))}
              <AttachmentList items={c.attachments.filter((a) => !a.itemId)} c={c} />
            </section>
          )}
        </article>
      </div>
    </div>
  );
}
