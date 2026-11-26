// handover.ai backend: zero-dependency Node server. Owns all state, calls the agent, serves the UI.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { people, items, connections } = require('./demo');

const PORT = +process.env.PORT || 8080;
const AGENT = process.env.AGENT_URL || 'http://127.0.0.1:8000';
const UI_DIR = path.resolve(__dirname, '../../ui');
const MEDIA_DIR = path.resolve(__dirname, '../media');
const DATA_FILE = path.resolve(__dirname, '../data.json');
fs.mkdirSync(MEDIA_DIR, { recursive: true });

let cases = {};
try { cases = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (_) {}
const save = () => { try { fs.writeFileSync(DATA_FILE, JSON.stringify(cases)); } catch (_) {} };

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.json': 'application/json' };

async function agent(route, body) {
  let r;
  try {
    r = await fetch(AGENT + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  } catch (e) { throw httpErr(502, `The agent service is not reachable at ${AGENT}. Start it with: python3 agent/server.py`); }
  const j = await r.json();
  if (!r.ok) throw httpErr(502, j.error || 'agent error');
  return j;
}
const httpErr = (status, message) => Object.assign(new Error(message), { status });

// What the agent sees: the case plus turns with attachments merged in.
function agentCase(c) {
  const turns = c.turns.map(t => ({ ...t, attachments: [...(t.attachments || []), ...((c.attach || {})[t.itemId] || [])] }));
  const have = new Set(turns.map(t => t.itemId));
  // attachments added to a question that has no answer yet still show up in the pack
  const extra = Object.entries(c.attach || {}).filter(([id]) => !have.has(id))
    .map(([itemId, attachments]) => ({ itemId, answer: '', attachments }));
  return { person: c.person, items: c.items, turns: [...turns.filter(t => t.answer), ...extra.map(e => ({ ...e, answer: 'See recording.' }))] };
}

function view(c) {
  const act = c.items.filter(i => !i.removed);
  const covered = i => i.documented || c.turns.some(t => t.itemId === i.id && t.answer && !t.followUp);
  const needsOwner = act.filter(i => i.mustReassign && !i.newOwner);
  const bySource = {};
  act.forEach(i => { const k = i.origin === 'manual' ? 'Added by hand' : i.source; bySource[k] = (bySource[k] || 0) + 1; });
  return { ...c, stats: {
    total: act.length, captured: act.filter(covered).length,
    atRisk: act.filter(i => !covered(i) && i.risk >= 60).length,
    needsOwner: needsOwner.length, bySource,
  } };
}

function getCase(id) {
  const c = cases[id];
  if (!c) throw httpErr(404, 'No such case');
  return c;
}

const routes = [];
const route = (method, pattern, fn) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn });

route('GET', '/api/connections', async () => connections);
route('GET', '/api/personas', async () => Object.values(people).map(p => ({ id: p.id, name: p.name, role: p.role })));
route('GET', '/api/cases', async () => Object.values(cases).map(view));

// The Workday-style resignation event. Idempotent per person.
route('POST', '/api/events', async ({ body }) => {
  const p = people[body.personId];
  if (!p) throw httpErr(400, 'Unknown person');
  if (!cases[p.id]) {
    cases[p.id] = { id: p.id, person: p, status: 'interview', items: items[p.id]().map(i => ({ ...i, origin: 'auto', newOwner: '' })),
      turns: [], attach: {}, pack: null, published: false, backfill: null, onboarding: null, done: {}, createdAt: Date.now() };
    save();
  }
  return view(cases[p.id]);
});

route('POST', '/api/reset', async () => { cases = {}; save(); return { ok: true }; });
route('GET', '/api/cases/:id', async ({ params }) => view(getCase(params.id)));

route('POST', '/api/cases/:id/items', async ({ params, body }) => {
  const c = getCase(params.id);
  if (!body.title) throw httpErr(400, 'Give it a name');
  const kind = body.kind || 'other';
  const risk = { duty: 70, approval: 75, repo: 70 }[kind] || 60;
  c.items.push({ id: 'x' + Date.now().toString(36), kind, title: body.title, source: 'Added by hand', origin: 'manual',
    addedBy: body.by || 'Leaver', risk, documented: false, mustReassign: !!body.mustReassign, newOwner: '',
    reasons: [body.note || 'Added by hand, no tool can see it.'], evidence: [{ id: 'x' + Date.now(), source: 'Added by hand', text: body.note || body.title }],
    skills: [] });
  save(); return view(c);
});
route('POST', '/api/cases/:id/items/:itemId/remove', async ({ params }) => {
  const c = getCase(params.id); const i = c.items.find(x => x.id === params.itemId);
  if (!i) throw httpErr(404, 'No such item'); i.removed = true; save(); return view(c);
});
route('POST', '/api/cases/:id/items/:itemId/restore', async ({ params }) => {
  const c = getCase(params.id); const i = c.items.find(x => x.id === params.itemId);
  if (!i) throw httpErr(404, 'No such item'); i.removed = false; save(); return view(c);
});
route('POST', '/api/cases/:id/items/:itemId/owner', async ({ params, body }) => {
  const c = getCase(params.id); const i = c.items.find(x => x.id === params.itemId);
  if (!i) throw httpErr(404, 'No such item'); i.newOwner = (body.newOwner || '').trim(); save(); return view(c);
});

route('GET', '/api/cases/:id/interview/next', async ({ params }) => {
  const c = getCase(params.id);
  const n = await agent('/next', { case: agentCase(c) });
  const item = c.items.find(i => i.id === n.itemId);
  return { ...n, itemTitle: item && item.title, itemSource: item && item.source };
});
route('POST', '/api/cases/:id/interview/answer', async ({ params, body }) => {
  const c = getCase(params.id);
  if (!body.answer || !body.answer.trim()) throw httpErr(400, 'Write or speak an answer first');
  c.turns.push({ itemId: body.itemId, question: body.question, answer: body.answer.trim(), followUp: !!body.followUp, at: Date.now() });
  c.pack = null; save(); return { ok: true };
});
route('POST', '/api/cases/:id/attachments', async ({ params, body }) => {
  const c = getCase(params.id);
  if (!body.itemId || !body.url) throw httpErr(400, 'itemId and url are required');
  (c.attach[body.itemId] = c.attach[body.itemId] || []).push({ type: body.type || 'link', url: body.url, name: body.name || body.url });
  c.pack = null; save(); return view(c);
});
route('POST', '/api/cases/:id/media', async ({ params, req, query }) => {
  const c = getCase(params.id);
  const name = (query.get('name') || 'recording.webm').replace(/[^\w.\-]/g, '_');
  const file = `${c.id}-${Date.now()}-${name}`;
  const chunks = []; let size = 0;
  for await (const ch of req) { size += ch.length; if (size > 200 * 1024 * 1024) throw httpErr(413, 'Max 200MB'); chunks.push(ch); }
  fs.writeFileSync(path.join(MEDIA_DIR, file), Buffer.concat(chunks));
  return { url: '/media/' + file, name };
});

route('POST', '/api/cases/:id/pack', async ({ params }) => {
  const c = getCase(params.id);
  const p = await agent('/pack', { case: agentCase(c) });
  p.owner = c.person.manager; p.personFirst = c.person.first;
  c.pack = p; c.published = false; c.status = 'review'; save(); return view(c);
});
route('POST', '/api/cases/:id/publish', async ({ params }) => {
  const c = getCase(params.id);
  if (!c.pack) throw httpErr(400, 'Write the pack first');
  // refresh owners in the pack so "needs a new owner" reflects what the manager assigned
  c.pack = { ...(await agent('/pack', { case: agentCase(c) })), owner: c.person.manager, personFirst: c.person.first };
  c.published = true; c.status = 'published'; save(); return view(c);
});
route('POST', '/api/cases/:id/ask', async ({ params, body }) => {
  const c = getCase(params.id);
  if (!c.pack) throw httpErr(400, 'There is no handover pack yet');
  return agent('/ask', { pack: c.pack, question: body.question || '' });
});
route('POST', '/api/cases/:id/backfill', async ({ params }) => {
  const c = getCase(params.id); c.backfill = await agent('/backfill', { case: agentCase(c) }); save(); return c.backfill;
});
route('POST', '/api/cases/:id/onboarding', async ({ params }) => {
  const c = getCase(params.id); c.onboarding = await agent('/onboarding', { case: agentCase(c) }); save(); return c.onboarding;
});
route('POST', '/api/cases/:id/tasks/:taskId', async ({ params, body }) => {
  const c = getCase(params.id); c.done[params.taskId] = !!body.done; save(); return c.done;
});

function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = ''; req.on('data', x => (d += x)); req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch (e) { reject(httpErr(400, 'Bad JSON')); } });
  });
}

function serveFile(res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'content-length': st.size });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const send = (code, obj) => { const d = JSON.stringify(obj); res.writeHead(code, { 'content-type': 'application/json' }); res.end(d); };
  try {
    if (url.pathname.startsWith('/api/')) {
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = r.re.exec(url.pathname);
        if (!m) continue;
        const body = req.method === 'POST' && !url.pathname.endsWith('/media') ? await readBody(req) : {};
        return send(200, await r.fn({ params: m.groups || {}, body, req, query: url.searchParams }));
      }
      return send(404, { error: 'Not found' });
    }
    if (url.pathname.startsWith('/media/')) return serveFile(res, path.join(MEDIA_DIR, path.basename(url.pathname)));
    const rel = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
    const file = path.join(UI_DIR, rel);
    if (!file.startsWith(UI_DIR)) return send(403, { error: 'no' });
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return serveFile(res, file);
    return serveFile(res, path.join(UI_DIR, 'index.html')); // SPA fallback
  } catch (e) { send(e.status || 500, { error: e.message }); }
});

server.listen(PORT, () => console.log(`handover.ai backend on http://localhost:${PORT}  (agent: ${AGENT})`));
