import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Connector } from '../types';

const ABOUT: Record<string, { label: string; finds: string }> = {
  github: { label: 'GitHub', finds: 'Repositories where they wrote most of the changes, files only they touch, and code they must approve (CODEOWNERS).' },
  jira: { label: 'Jira', finds: 'Open work, and the requests they approve.' },
  confluence: { label: 'Confluence', finds: 'Pages they wrote or keep up to date.' },
  'google-drive': { label: 'Google Drive', finds: 'Shared files they own, which need a new owner before their account closes.' },
  'google-calendar': { label: 'Google Calendar', finds: 'Recurring meetings they run, which usually mean a recurring duty.' },
  pagerduty: { label: 'PagerDuty', finds: 'On-call rotations and escalations they sit on.' },
  fixture: { label: 'Demo data', finds: 'Sample work for the demo people, so the product runs without real accounts.' },
};

export default function ConnectionsPage() {
  const [connectors, setConnectors] = useState<Connector[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.connectors().then(setConnectors).catch((e: Error) => setError(e.message));
  }, []);

  return (
    <div style={{ maxWidth: 760 }}>
      <h1>Connections</h1>
      <p className="lede">
        When someone resigns, every connected tool is searched for what they own. That gives a first draft of the map.
        The person leaving and their manager then remove anything that isn&apos;t theirs and add what the tools can&apos;t
        see, like a promise made to a customer or a task done from memory.
      </p>
      {error && <p className="note error">Couldn&apos;t load connections: {error}</p>}
      <div className="panel">
        {connectors?.map((c) => {
          const about = ABOUT[c.name] ?? { label: c.name, finds: '' };
          return (
            <div className="conn" key={c.name}>
              <div>
                <b>{about.label}</b>
                <p className="small muted">{about.finds}</p>
              </div>
              <span className={`pill ${c.enabled ? 'on' : ''}`}>{c.enabled ? 'Connected' : 'Not connected'}</span>
            </div>
          );
        })}
        <div className="conn">
          <div>
            <b>Added by hand</b>
            <p className="small muted">Anything the person or their manager adds on the map. Always available.</p>
          </div>
          <span className="pill on">Always on</span>
        </div>
      </div>
      <p className="small faint" style={{ marginTop: 14 }}>
        To connect a tool, set its token in the backend settings and restart. See the README for each variable.
      </p>
    </div>
  );
}
