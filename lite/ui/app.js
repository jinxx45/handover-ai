// handover.ai UI: no framework, no build step. Hash routing: #/  #/connections  #/case/<id>?as=leaver|manager|newhire&tab=...
const $ = s => document.querySelector(s);
const api = async (path, body) => {
  const r = await fetch('/api' + path, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
};
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(9)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}
const toast = msg => { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600); };
const guard = fn => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message); } };

// ---------- router / state
const S = { cases: null, c: null, draft: '', asks: [], busy: false, recording: null };
const parse = () => {
  const [p, q = ''] = location.hash.slice(1).split('?');
  return { parts: p.split('/').filter(Boolean), q: new URLSearchParams(q) };
};
const go = (path, params) => { location.hash = path + (params ? '?' + new URLSearchParams(params) : ''); };
window.addEventListener('hashchange', () => render());

const POVS = {
  leaver: { label: p => p.first, av: p => p.first.slice(0, 2).toUpperCase(), tabs: [['own', 'What you own'], ['interview', 'Interview'], ['pack', 'Your pack']] },
  manager: { label: p => p.manager.split(' ')[0], av: p => p.manager.split(' ').map(x => x[0]).join(''), tabs: [['own', 'What they own'], ['interview', 'Interview'], ['pack', 'Pack'], ['backfill', 'Backfill'], ['kit', 'Onboarding kit']] },
  newhire: { label: p => p.newHire.split(' ')[0], av: () => '+', tabs: [['kit', 'First 90 days'], ['ask', 'Ask the handover'], ['pack', 'Pack']] },
};
const POV_NOUN = { leaver: 'Leaving', manager: 'Manager', newhire: 'New hire' };

// ---------- shared pieces
function nav(active, dark) {
  return h('header', { class: 'nav' + (dark ? ' dark' : ''), id: 'nav' },
    h('a', { href: '#/', class: 'brand' }, h('i'), 'handover.ai'),
    h('nav', { class: 'links' },
      h('a', { href: '#/', class: active === 'home' ? 'on' : '' }, 'Overview'),
      h('a', { href: '#/departures', class: active === 'dep' ? 'on' : '' }, 'Departures'),
      h('a', { href: '#/connections', class: active === 'conn' ? 'on' : '' }, 'Connections')));
}
function shell(active, content) {
  return h('div', null, nav(active), h('main', { class: 'page' }, content));
}
const state = (c, i) => {
  const answered = c.turns.some(t => t.itemId === i.id && t.answer && !t.followUp);
  if (i.mustReassign && !i.newOwner) return 'owner';
  if (answered) return 'ok';
  if (i.documented) return 'doc';
  return 'risk';
};
const LABEL = { owner: 'Needs a new owner', ok: 'Captured', doc: 'Written down', risk: 'Only in their head' };
function strip(c) {
  const act = c.items.filter(i => !i.removed).sort((a, b) => b.risk - a.risk);
  return h('div', null,
    h('div', { class: 'strip' }, act.map((i, n) => h('i', { class: state(c, i), style: `--n:${n}`, title: `${i.title}: ${LABEL[state(c, i)]}` }))),
    h('div', { class: 'legend' },
      [['Only in their head', 'var(--know)'], ['Needs a new owner', 'var(--owner)'], ['Captured', 'var(--ok)'], ['Written down', 'var(--doc)']]
        .map(([l, col]) => h('span', { style: `--c:${col}` }, l))));
}
const sentence = c => {
  const s = c.stats;
  return h('p', { class: 'sentence' }, `${c.person.first} owns `, h('b', null, `${s.total} things`),
    `. ${s.captured} ${s.captured === 1 ? 'is' : 'are'} safe. `, h('b', null, `${s.needsOwner}`), ` still ${s.needsOwner === 1 ? 'needs' : 'need'} a new owner.`);
};
const sourceCounts = c => h('p', { class: 'small muted' }, 'Found by: ', Object.entries(c.stats.bySource).map(([k, v]) => `${k} ${v}`).join(', '));
const words = (text, delay = 0) => text.split(' ').map((w, i) => [h('span', { class: 'word', style: `animation-delay:${delay + i * 0.08}s` }, w), ' ']);
const resign = id => guard(async () => { const c = await api('/events', { personId: id }); go(`/case/${c.id}`, { as: 'leaver', tab: 'own' }); });

// ---------- landing (keynote style)
async function home() {
  S.cases = await api('/cases');
  const heroRows = [['billing-sync', 'You wrote 61% of it. No runbook.', 'risk', 'At risk'],
    ['Required reviewer for /payments/limits', '9 pull requests wait on you.', 'owner', 'Needs a new owner'],
    ['quarter-end-recon.sh', 'Captured in your interview.', 'ok', 'Captured']];
  const blocks = ['ok', 'risk', 'owner', 'owner', 'owner', 'risk', 'owner', 'doc'];
  const el = h('div', null, nav('home', true),
    h('section', { class: 'sec black hero', id: 'hero' },
      h('h1', null, words('Nothing walks out the door.', 0.1)),
      h('p', { class: 'lede rv', style: '--d:.7s' }, 'When someone resigns, handover.ai finds what only they know, asks them about it, and gets the next person ready.'),
      h('div', { class: 'ctas rv', style: '--d:.9s' }, h('button', { class: 'btn primary lg', onclick: resign('priya') }, 'Watch Priya resign'), h('a', { href: '#/departures' }, 'See all departures')),
      h('div', { class: 'device', id: 'device' }, h('div', { class: 'bar' }, h('i'), h('i'), h('i')),
        h('div', { class: 't' }, 'Priya Raman, senior backend engineer. 11 days left.'),
        h('div', { class: 'big' }, 'Priya owns 8 things. 6 live only in her head.'),
        h('div', { class: 'strip' }, blocks.map((b, n) => h('i', { class: b, style: `--n:${n}` }))),
        h('div', { class: 'rows' }, heroRows.map(([t, s, k, l], n) => h('div', { class: 'r', style: `--n:${n}` }, h('div', null, t, h('small', null, s)), h('span', { class: 'pillt ' + k }, l)))))),
    h('section', { class: 'sec white' },
      h('h2', { class: 'rv' }, 'It already knows what’s theirs.'),
      h('p', { class: 'lede rv', style: '--d:.1s' }, 'GitHub, Jira, Confluence, Drive, Calendar and PagerDuty report what a person owns the moment Workday says they’re leaving.'),
      h('div', { class: 'stats' }, [[61, '%', 'of billing-sync was written by one person'], [9, '', 'pull requests nobody else can approve'], [14, '', 'access requests a manager approved in 90 days']]
        .map(([n, u, l], i) => h('div', { class: 'stat rv', style: `--d:${0.1 + i * 0.12}s` }, h('b', { 'data-count': n, 'data-unit': u }, '0' + u), h('span', null, l))))),
    h('section', { class: 'sec fog' },
      h('h2', { class: 'rv' }, 'It only asks what isn’t written down.'),
      h('p', { class: 'lede rv', style: '--d:.1s' }, 'Riskiest first. Type, speak, or record your screen. Vague answers get a follow-up.'),
      h('div', { class: 'mock' },
        h('div', { class: 'bub q rv' }, 'quarter-end-recon.sh runs once a quarter. What are the steps, and how do you know it worked?'),
        h('div', { class: 'bub a rv', style: '--d:.35s' }, 'Run it after the finance freeze. Then check the S3 totals match the ledger.'),
        h('div', { class: 'bub fu rv', style: '--d:.7s' }, 'Can you give one example of a time it went wrong?'))),
    h('section', { class: 'sec black' },
      h('h2', { class: 'rv' }, h('span', { class: 'grad' }, 'Every fact shows its source.')),
      h('p', { class: 'fact rv', style: '--d:.15s' }, 'When Kafka lags, billing-sync replays batches twice unless you clear the dedupe cache first.', h('sup', null, 'Interview'), ' Priya wrote 412 of its 675 commits.', h('sup', { class: 'g' }, 'GitHub')),
      h('p', { class: 'lede rv', style: '--d:.3s' }, 'And when the answer isn’t in the handover, it says so instead of guessing.')),
    h('section', { class: 'sec fog' },
      h('h2', { class: 'rv' }, 'The next hire starts where she left off.'),
      h('p', { class: 'lede rv', style: '--d:.1s' }, 'A job description built from the real work, and a 90-day plan built for one person, not the whole team.'),
      h('div', { class: 'kit rv', id: 'kit' }, ['Meet Suresh, Arun and Ravi, the people Priya named.', 'Shadow, then run quarter-end-recon.sh.', 'Take over the /payments/limits reviews from Ravi.'].map(t => h('div', null, h('i'), t)))),
    h('section', { class: 'sec try' },
      h('h2', { class: 'rv' }, 'Try it.'),
      h('p', { class: 'lede rv', style: '--d:.1s' }, 'Each button sends the same event Workday would.'),
      h('div', { class: 'row rv', style: '--d:.2s' }, h('button', { class: 'btn primary lg', onclick: resign('priya') }, 'Priya resigns'), h('button', { class: 'btn onDark lg', onclick: resign('meera') }, 'Meera, a manager, resigns')),
      S.cases.length ? h('div', { class: 'cases rv' }, S.cases.map(c => h('a', { href: `#/case/${c.id}?as=manager&tab=own` }, h('div', null, c.person.name, h('div', { class: 'small faint' }, `${c.stats.needsOwner} to reassign, ${c.person.daysLeft} days left`)), h('span', { class: 'small', style: 'color:#2997ff' }, 'Open')))) : null),
    h('footer', { class: 'foot' }, 'handover.ai. Built at the Chennai hackathon.'));
  return el;
}
function afterLanding(root) {
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    e.target.classList.add('in'); io.unobserve(e.target);
    e.target.querySelectorAll('[data-count]').forEach(countUp);
    if (e.target.matches('[data-count]')) countUp(e.target);
  }), { threshold: 0.25 });
  root.querySelectorAll('.rv,#kit').forEach(x => io.observe(x));
  const nv = root.querySelector('#nav'), hero = root.querySelector('#hero'), dev = root.querySelector('#device');
  const onScroll = () => {
    if (!document.body.contains(hero)) return window.removeEventListener('scroll', onScroll);
    const y = window.scrollY;
    const under = [...root.querySelectorAll('.sec')].find(x => x.offsetTop <= y + 26 && y + 26 < x.offsetTop + x.offsetHeight);
    nv.classList.toggle('dark', !!under && (under.classList.contains('black') || under.classList.contains('try')));
    if (dev && !matchMedia('(prefers-reduced-motion: reduce)').matches) dev.style.transform = `translateY(${Math.min(y * -0.12, 0)}px) scale(${1 + Math.min(y / 4000, 0.04)})`;
  };
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
}
function countUp(el) {
  const to = +el.dataset.count, unit = el.dataset.unit || '', t0 = performance.now();
  const step = t => { const p = Math.min((t - t0) / 1400, 1), e = 1 - Math.pow(1 - p, 4); el.textContent = Math.round(to * e) + unit; if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

// interview progress and owner counts, shared by the case page
function metrics(c) {
  const act = c.items.filter(i => !i.removed);
  const q = act.filter(i => i.risk >= 40 && (!i.documented || i.mustReassign)).sort((a, b) => b.risk - a.risk).slice(0, 6);
  const asked = q.filter(i => c.turns.some(t => t.itemId === i.id && t.answer && !t.followUp)).length;
  return { asked, askTotal: q.length };
}
// ---------- departures: every owned thing is a tile; safe ones sort first, so each row fills as the handover completes
const SAFE = s => s === 'ok' || s === 'doc';
const TILE_ORDER = { ok: 0, doc: 1, owner: 2, risk: 3 };
const TILE_LABEL = { ok: 'Captured', doc: 'Written down', owner: 'Needs a new owner', risk: 'Only in their head' };
const STAGES = [['mapped', 'Mapped'], ['interview', 'Interview'], ['pack', 'Pack'], ['published', 'Published']];
const stageOf = c => c.published ? 4 : c.pack ? 3 : c.turns.length ? 2 : 1;
async function departures() {
  S.cases = await api('/cases');
  const personas = await api('/personas');
  const waiting = personas.filter(p => !S.cases.some(c => c.id === p.id));
  const atRisk = S.cases.reduce((n, c) => n + c.items.filter(i => !i.removed && !SAFE(state(c, i))).length, 0);
  const lede = S.cases.length
    ? `${S.cases.length} ${S.cases.length === 1 ? 'person is' : 'people are'} handing over. ${atRisk ? `${atRisk} ${atRisk === 1 ? 'thing isn’t' : 'things aren’t'} safe yet.` : 'Everything is safe.'}`
    : 'Nobody is leaving right now.';
  const card = c => {
    const items = c.items.filter(i => !i.removed).map(i => ({ i, s: state(c, i) })).sort((a, b) => TILE_ORDER[a.s] - TILE_ORDER[b.s] || b.i.risk - a.i.risk);
    const safe = items.filter(x => SAFE(x.s)).length, owner = items.filter(x => x.s === 'owner').length, head = items.filter(x => x.s === 'risk').length;
    const rest = [owner && `${owner} ${owner === 1 ? 'needs' : 'need'} a new owner`, head && `${head} only in ${c.person.first}’s head`].filter(Boolean).join(', ');
    const st = stageOf(c);
    return h('article', { class: 'dcard' },
      h('header', { class: 'dc-head' },
        h('div', null, h('h2', null, h('a', { href: `#/case/${c.id}?as=manager&tab=own` }, c.person.name)), h('p', null, c.person.role)),
        h('div', { class: 'dc-days' }, h('b', null, c.person.daysLeft), h('span', null, c.person.daysLeft === 1 ? 'day left' : 'days left', h('small', null, `Last day ${c.person.lastDay}`)))),
      h('p', { class: 'dc-sum' }, h('b', null, `${safe} of ${items.length} safe.`), rest ? ` ${rest[0].toUpperCase() + rest.slice(1)}.` : ' Ready to publish.'),
      h('ul', { class: 'dc-tiles', 'aria-label': `What ${c.person.first} owns` }, items.map(({ i, s }, n) =>
        h('li', { class: 't-' + s, style: `--n:${n}`, title: `${i.title}: ${TILE_LABEL[s]}` },
          h('span', { class: 'tt' }, i.title), h('span', { class: 'ts' }, s === 'owner' ? 'Needs owner' : s === 'risk' ? 'Not captured' : (i.newOwner ? `To ${firstName(i.newOwner)}` : TILE_LABEL[s]))))),
      h('footer', { class: 'dc-foot' },
        h('ol', { class: 'dc-stage', 'aria-label': `Stage ${st} of 4: ${STAGES[st - 1][1]}` }, STAGES.map(([k, l], n) => h('li', { class: n + 1 < st ? 'done' : n + 1 === st ? 'now' : '' }, l))),
        h('div', { class: 'row' },
          h('a', { class: 'btn ghost', href: `#/case/${c.id}?as=leaver&tab=${st >= 3 ? 'pack' : 'interview'}` }, `Continue as ${c.person.first}`),
          h('a', { class: 'btn primary', href: `#/case/${c.id}?as=manager&tab=own` }, 'Open handover'))));
  };
  return shell('dep', h('div', { class: 'dep2' },
    h('header', { class: 'dep-head' }, h('div', null, h('h1', null, 'Departures'), h('p', null, lede)),
      S.cases.length ? h('ul', { class: 'dep-key', 'aria-label': 'Tile colours' }, ['ok', 'doc', 'owner', 'risk'].map(k => h('li', { class: 'k-' + k }, TILE_LABEL[k]))) : null),
    S.cases.length ? h('div', { class: 'dep-list' }, S.cases.map(card))
      : h('div', { class: 'dep-empty' }, h('ul', { class: 'dc-tiles ghost', 'aria-hidden': 'true' }, Array.from({ length: 8 }, (_, n) => h('li', { style: `--n:${n}` }))),
        h('p', null, 'When Workday sends a resignation, everything that person owns appears here as tiles. They turn green as the handover is done.')),
    waiting.length ? h('section', { class: 'dnext' },
      h('h3', null, S.cases.length ? 'Simulate another resignation' : 'Simulate a resignation'),
      h('div', { class: 'dnextrow' }, waiting.map(p => h('button', { class: 'dperson', onclick: resign(p.id) },
        h('span', { class: 'davatar' }, p.name.split(' ').map(x => x[0]).join('')),
        h('span', null, h('b', null, p.name), h('span', { class: 'small muted' }, p.role)),
        h('span', { class: 'dgo' }, 'Resign'))))) : null,
    S.cases.length ? h('p', { class: 'dreset' }, h('button', { class: 'btn ghost sm', onclick: guard(async () => { await api('/reset', {}); render(); toast('Demo reset'); }) }, 'Reset the demo')) : null));
}
function afterDepartures() {}

async function connections() {
  const cs = await api('/connections');
  return shell('conn', h('div', null,
    h('div', { class: 'top' }, h('h1', null, 'Connections'), h('p', { class: 'role' }, 'Each tool reports what a leaving person owns.')),
    h('div', { class: 'panel list' }, cs.map(c => h('div', { class: 'li' }, h('div', { class: 'grow' }, h('div', { style: 'font-weight:600;font-size:19px' }, c.name), h('div', { class: 'small muted' }, c.finds)), h('span', { class: 'tag doc' }, c.status))))));
}

// ---------- case page
// Frame: left-aligned header, real navigation (numbered steps for the leaver, because it is a sequence),
// and a separate floating demo bar for switching viewpoints, so demo controls never look like product UI.
const firstName = s => s.split(' ')[0];
function stepDone(c, k) {
  if (k === 'own') return c.turns.length > 0 || !!c.pack;
  if (k === 'interview') return !!c.pack;
  if (k === 'pack') return c.published;
  return false;
}
async function casePage(id, pov, tab) {
  S.c = await api('/cases/' + id);
  const c = S.c, P = POVS[pov], p = c.person;
  if (!P.tabs.find(t => t[0] === tab)) tab = P.tabs[0][0];
  const goTab = k => () => go('/case/' + id, { as: pov, tab: k });
  const steps = pov === 'leaver'
    ? h('ol', { class: 'steps' }, P.tabs.map(([k, l], i) => h('li', { class: (tab === k ? 'on ' : '') + (stepDone(c, k) ? 'done' : '') },
        h('button', { onclick: goTab(k), 'aria-current': tab === k ? 'step' : null }, h('span', { class: 'num' }, stepDone(c, k) && tab !== k ? '✓' : String(i + 1)), l))))
    : h('nav', { class: 'utabs' }, P.tabs.map(([k, l]) => h('button', { class: tab === k ? 'on' : '', onclick: goTab(k), 'aria-current': tab === k ? 'page' : null }, l)));
  const title = { leaver: 'Your handover', manager: p.name, newhire: `Taking over from ${p.first}` }[pov];
  const sub = { leaver: `${p.role}. Your manager is ${p.manager}.`, manager: `${p.role}. Reports to you.`, newhire: `${p.role}. Your manager is ${p.manager}.` }[pov];
  const body = h('div', { class: 'cbody' });
  const view = { own: ownTab, interview: interviewTab, pack: packTab, backfill: backfillTab, kit: kitTab, ask: askTab }[tab];
  await view(body, c, pov);
  const demo = h('div', { class: 'demobar', role: 'group', 'aria-label': 'Demo: switch viewpoint' }, h('span', { class: 'dl' }, 'View as'),
    Object.keys(POVS).map(k => h('button', { class: pov === k ? 'on' : '', 'aria-pressed': pov === k ? 'true' : 'false', onclick: () => go('/case/' + id, { as: k, tab: POVS[k].tabs[0][0] }) },
      h('span', { class: 'av' }, POVS[k].av(p)), firstName({ leaver: p.name, manager: p.manager, newhire: p.newHire }[k]), h('span', { class: 'role' }, POV_NOUN[k]))));
  const left = p.daysLeft, pct = Math.round((1 - left / p.noticeDays) * 100);
  return shell('dep', h('div', { class: 'case' },
    h('a', { class: 'crumb', href: '#/departures' }, 'Departures'),
    h('header', { class: 'chead' },
      h('div', null, h('h1', null, title), h('p', { class: 'csub' }, sub)),
      h('div', { class: 'clock', 'aria-label': `${left} days left, last day ${p.lastDay}` },
        h('b', null, left), h('span', null, left === 1 ? 'day left' : 'days left', h('small', null, `Last day ${p.lastDay}`)),
        h('div', { class: 'cbar' }, h('i', { style: `width:${pct}%` })))),
    steps, body, demo));
}

// ---------- What you own: grouped by what happens next, so groups replace the legend and status tags
async function ownTab(root, c, pov) {
  const p = c.person, me = pov === 'leaver';
  const act = c.items.filter(i => !i.removed);
  const answered = i => c.turns.some(t => t.itemId === i.id && t.answer && !t.followUp);
  const groups = [
    { key: 'owner', items: act.filter(i => i.mustReassign),
      title: me ? 'Needs a new owner before you go' : 'Needs a new owner',
      note: me ? `These stop working when your account closes. ${firstName(p.manager)} chooses who takes each one, and the interview asks how you run them.` : pov === 'manager' ? `These stop working on ${p.lastDay}. Name someone for each.` : 'These moved to new owners.' },
    { key: 'know', items: act.filter(i => !i.mustReassign && !i.documented),
      title: me ? 'Only you know how these work' : `Only ${p.first} knows how these work`,
      note: me ? 'The interview asks about these, riskiest first.' : `The interview asks ${p.first} about these.` },
    { key: 'doc', items: act.filter(i => !i.mustReassign && i.documented),
      title: 'Already written down', note: 'Nothing to do.' },
  ].filter(g => g.items.length);
  const sources = [...new Set(act.filter(i => i.origin !== 'manual').map(i => i.source))];
  const removed = c.items.filter(i => i.removed);

  const row = (g, i) => {
    const side = [];
    if (g.key === 'owner') {
      if (pov === 'manager') side.push(h('label', { class: 'owner' }, h('span', { class: 'sr' }, `New owner for ${i.title}`),
        h('input', { type: 'text', class: i.newOwner ? 'set' : '', placeholder: 'Choose someone', value: i.newOwner,
          onchange: guard(async e => { await api(`/cases/${c.id}/items/${i.id}/owner`, { newOwner: e.target.value }); toast(e.target.value ? `${i.title} goes to ${e.target.value}` : 'Owner cleared'); render(); }) })));
      else if (i.newOwner) side.push(h('span', { class: 'who' }, `Goes to ${i.newOwner}`));
    }
    if (g.key === 'know' && answered(i)) side.push(h('span', { class: 'who ok' }, me ? 'Covered in your interview' : 'Covered in the interview'));
    if (me) side.push(h('button', { class: 'notmine', onclick: guard(async () => { await api(`/cases/${c.id}/items/${i.id}/remove`, {}); render(); toast(`Removed ${i.title}`); }) }, 'Not mine'));
    return h('li', { class: 'oi' },
      h('div', { class: 'ot' }, h('span', { class: 'onm' }, i.title), h('span', { class: 'os' }, i.origin === 'manual' ? `Added by ${i.addedBy || 'hand'}` : i.source)),
      h('p', { class: 'or' }, i.reasons.join(' ')),
      side.length ? h('div', { class: 'oa' }, side) : null);
  };

  const list = h('div', { class: 'olist' },
    h('h2', { class: 'oh' }, me ? 'Is this everything that’s yours?' : pov === 'manager' ? `What ${p.first} owns` : `What ${p.first} owned`),
    h('p', { class: 'olede' }, `Found in ${sources.slice(0, -1).join(', ')}${sources.length > 1 ? ' and ' : ''}${sources.slice(-1)}.`, me ? ' Remove anything that isn’t yours and add what the tools can’t see.' : ''),
    groups.map(g => h('section', { class: 'og g-' + g.key },
      h('header', null, h('h3', null, g.title, h('span', { class: 'cnt' }, g.items.length)), h('p', null, g.note)),
      h('ul', null, g.items.sort((a, b) => b.risk - a.risk).map(i => row(g, i))))),
    removed.length ? h('p', { class: 'oremoved' }, `Marked as not ${me ? 'yours' : p.first + '’s'}: `,
      removed.map((r, n) => [n ? ', ' : '', r.title, ' ', h('button', { class: 'link', onclick: guard(async () => { await api(`/cases/${c.id}/items/${r.id}/restore`, {}); render(); }) }, 'Undo')])) : null,
    pov !== 'newhire' ? addForm(c, pov) : null);

  // aside: one job, one button
  const need = c.stats.needsOwner, m = metrics(c);
  const left = m.askTotal - m.asked;
  let aside;
  if (me) aside = c.pack
    ? asideCard('Your pack is written', 'Read it once and flag anything wrong or private before it’s published.', 'Review your pack', 'pack', c, pov)
    : asideCard(c.turns.length ? 'Continue the interview' : 'Next: the interview',
        `${left} question${left === 1 ? '' : 's'} about how you run the things above, riskiest first. Type, talk, or record your screen. About ${Math.max(5, left * 3)} minutes.`,
        c.turns.length ? 'Continue the interview' : 'Start the interview', 'interview', c, pov);
  else if (pov === 'manager') aside = need
    ? asideCard(`${need} ${need === 1 ? 'thing needs' : 'things need'} an owner`, `Name someone for each before ${p.lastDay}. Then publish the pack for ${firstName(p.newHire)}.`, 'Go to the pack', 'pack', c, pov)
    : asideCard('Every handoff has an owner', c.pack ? 'The pack is ready to publish.' : `Waiting for ${p.first} to finish the interview.`, 'Go to the pack', 'pack', c, pov);
  root.append(h('div', { class: 'olayout' }, list, aside ? h('aside', { class: 'oside' }, aside, miniStrip(c, me)) : null));
}
function asideCard(t, body, cta, tab, c, pov) {
  return h('div', { class: 'acard' }, h('h3', null, t), h('p', null, body),
    h('button', { class: 'btn primary', onclick: () => go('/case/' + c.id, { as: pov, tab }) }, cta));
}
function miniStrip(c, me) {
  const act = c.items.filter(i => !i.removed).sort((a, b) => b.risk - a.risk);
  const counts = { owner: 0, ok: 0, risk: 0, doc: 0 };
  act.forEach(i => counts[state(c, i)]++);
  const lab = { owner: 'need a new owner', risk: me ? 'only in your head' : 'only in their head', ok: 'captured', doc: 'written down' };
  return h('div', { class: 'mstrip' },
    h('div', { class: 'strip' }, act.map((i, n) => h('i', { class: state(c, i), style: `--n:${n}`, title: i.title }))),
    h('ul', null, Object.entries(counts).filter(([, v]) => v).map(([k, v]) => h('li', { class: 'k-' + k }, h('b', null, v), ' ', lab[k]))));
}
function addForm(c, pov) {
  const me = pov === 'leaver';
  const wrap = h('div', { class: 'oadd' });
  const closed = () => wrap.replaceChildren(h('button', { class: 'addbtn', onclick: open }, h('span', { 'aria-hidden': 'true' }, '+'), 'Add something the tools missed'));
  const open = () => {
    const t = h('input', { type: 'text', placeholder: me ? 'For example, a monthly FX report I send Finance' : 'What did the tools miss?', 'aria-label': 'What is it?' });
    const mr = h('input', { type: 'checkbox', id: 'mr' });
    const save = guard(async () => { if (!t.value.trim()) return t.focus(); await api(`/cases/${c.id}/items`, { title: t.value.trim(), by: me ? c.person.first : firstName(c.person.manager), mustReassign: mr.checked, kind: mr.checked ? 'duty' : 'other' }); toast('Added'); render(); });
    t.addEventListener('keydown', e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') closed(); });
    wrap.replaceChildren(h('div', { class: 'addform' }, t,
      h('label', { class: 'chk', for: 'mr' }, mr, 'Someone has to take this over when ', me ? 'I leave' : `${c.person.first} leaves`),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: save }, 'Add'), h('button', { class: 'btn ghost', onclick: closed }, 'Cancel'))));
    t.focus();
  };
  closed();
  return wrap;
}

// Interview
async function interviewTab(root, c, pov) {
  const next = await api(`/cases/${c.id}/interview/next`);
  const byItem = {};
  c.turns.forEach(t => (byItem[t.itemId] = byItem[t.itemId] || []).push(t));
  const q = c.items.filter(i => !i.removed && i.risk >= 40 && (!i.documented || i.mustReassign)).sort((a, b) => b.risk - a.risk).slice(0, 6);
  const rail = h('div', { class: 'rail' }, h('h3', null, 'Topics'), h('p', { class: 'small muted' }, 'Riskiest first. Only things that are not written down.'),
    h('ul', null, q.map(i => h('li', null, h('span', { class: 'dot ' + (byItem[i.id] ? 'done' : next.itemId === i.id ? 'now' : '') }), i.title))));
  const main = h('div');
  const att = itemId => (c.attach[itemId] || []).length ? h('div', { class: 'att' }, c.attach[itemId].map(a => a.type === 'video' ? h('video', { src: a.url, controls: true }) : h('a', { href: a.url, target: '_blank' }, a.name))) : null;
  q.forEach(i => (byItem[i.id] || []).forEach(t => main.append(h('div', { class: 'turn' }, h('div', { class: 'q' }, `${t.followUp ? 'Follow-up: ' : ''}${t.question}`), h('div', { class: 'a' }, t.answer),
    t === byItem[i.id][byItem[i.id].length - 1] ? att(i.id) : null))));
  if (!next.done) {
    if (pov !== 'leaver') {
      main.append(h('div', { class: 'ask-card' }, h('div', { class: 'small muted' }, `Next question for ${c.person.first}, about ${next.itemTitle}`), h('div', { class: 'qq' }, next.question),
        h('p', { class: 'small muted' }, `Only ${c.person.first} can answer. You can watch along.`),
        h('div', { class: 'sp' }), h('button', { class: 'btn', onclick: () => go('/case/' + c.id, { as: 'leaver', tab: 'interview' }) }, `Switch to ${c.person.first}'s view`)));
    } else main.append(answerCard(c, next));
  } else {
    main.append(h('div', { class: 'ask-card' }, h('div', { class: 'qq' }, c.pack ? 'Interview complete. Your pack is ready.' : 'That covers everything that is not written down.'),
      c.pack ? h('button', { class: 'btn primary', onclick: () => go('/case/' + c.id, { as: pov, tab: 'pack' }) }, 'Open the pack')
        : pov === 'leaver' ? h('button', { class: 'btn primary', onclick: guard(async () => { await api(`/cases/${c.id}/pack`, {}); go('/case/' + c.id, { as: 'leaver', tab: 'pack' }); }) }, 'Write the pack') : h('p', { class: 'muted' }, `Waiting for ${c.person.first} to finish.`)));
  }
  if (!next.done && pov === 'leaver') main.append(h('div', { style: 'margin-top:14px' }, h('button', { class: 'btn ghost sm', onclick: guard(async () => { await api(`/cases/${c.id}/pack`, {}); go('/case/' + c.id, { as: 'leaver', tab: 'pack' }); }) }, 'Finish early and write the pack')));
  root.append(h('div', { class: 'grid2' }, main, rail));
}

function answerCard(c, next) {
  const ta = h('textarea', { placeholder: 'Type your answer, or press Speak', oninput: e => (S.draft = e.target.value) }, S.draft);
  ta.value = S.draft;
  let rec = null;
  const speak = h('button', { class: 'btn ghost', onclick: () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return toast('Dictation needs Chrome, Edge or Safari');
    if (rec) { rec.stop(); return; }
    rec = new SR(); rec.continuous = true; rec.interimResults = false;
    rec.onresult = e => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) { ta.value = (ta.value + ' ' + e.results[i][0].transcript).trim(); S.draft = ta.value; } };
    rec.onend = () => { rec = null; speak.textContent = 'Speak'; };
    rec.start(); speak.textContent = 'Stop speaking';
  } }, 'Speak');
  const link = h('input', { type: 'text', placeholder: 'Paste a Drive, Loom, YouTube or SharePoint link', style: 'display:none;margin-top:10px' });
  const addLink = guard(async () => { if (!link.value.trim()) return; await api(`/cases/${c.id}/attachments`, { itemId: next.itemId, type: 'link', url: link.value.trim(), name: link.value.trim().replace(/^https?:\/\//, '').slice(0, 48) }); link.value = ''; link.style.display = 'none'; toast('Link added'); render(); });
  link.addEventListener('keydown', e => e.key === 'Enter' && addLink());
  const up = h('input', { type: 'file', accept: 'video/*,audio/*', style: 'display:none', onchange: guard(async e => {
    const f = e.target.files[0]; if (!f) return; toast('Uploading…');
    const r = await fetch(`/api/cases/${c.id}/media?name=${encodeURIComponent(f.name)}`, { method: 'POST', body: f }); const m = await r.json(); if (!r.ok) throw new Error(m.error);
    await api(`/cases/${c.id}/attachments`, { itemId: next.itemId, type: 'video', url: m.url, name: f.name }); render();
  }) });
  const recBtn = h('button', { class: 'btn ghost', onclick: guard(async () => {
    if (S.recording) { S.recording.stop(); return; }
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    const chunks = []; const mr = new MediaRecorder(stream); S.recording = mr;
    mr.ondataavailable = e => chunks.push(e.data);
    mr.onstop = guard(async () => { stream.getTracks().forEach(t => t.stop()); S.recording = null;
      const blob = new Blob(chunks, { type: 'video/webm' });
      const r = await fetch(`/api/cases/${c.id}/media?name=screen-recording.webm`, { method: 'POST', body: blob }); const m = await r.json();
      await api(`/cases/${c.id}/attachments`, { itemId: next.itemId, type: 'video', url: m.url, name: 'Screen recording' }); render(); });
    mr.start(); recBtn.textContent = 'Stop recording'; recBtn.classList.add('rec');
  }) }, 'Record my screen');
  const submit = guard(async () => {
    await api(`/cases/${c.id}/interview/answer`, { itemId: next.itemId, question: next.question, answer: ta.value, followUp: next.followUp });
    S.draft = ''; render();
  });
  return h('div', { class: 'ask-card' },
    h('div', { class: 'small muted' }, next.followUp ? `Follow-up on ${next.itemTitle}` : `About ${next.itemTitle}, from ${next.itemSource}`),
    h('div', { class: 'qq' }, next.question), ta,
    h('div', { class: 'row', style: 'margin-top:12px;flex-wrap:wrap' }, h('button', { class: 'btn primary', onclick: submit }, 'Send answer'), speak,
      h('button', { class: 'btn ghost', onclick: () => { link.style.display = link.style.display === 'none' ? 'block' : 'none'; link.focus(); } }, 'Add a link'),
      h('button', { class: 'btn ghost', onclick: () => up.click() }, 'Upload a video'), recBtn, up),
    link, (c.attach[next.itemId] || []).length ? h('div', { class: 'att' }, c.attach[next.itemId].map(a => a.type === 'video' ? h('video', { src: a.url, controls: true }) : h('a', { href: a.url, target: '_blank' }, a.name))) : null);
}

// Pack
async function packTab(root, c, pov) {
  if (!c.pack) {
    root.append(h('div', { class: 'empty' }, pov === 'newhire' ? `${c.person.first}'s handover is still being prepared.` : 'No pack yet. It is written once the interview is done.',
      pov === 'leaver' ? h('div', { style: 'margin-top:14px' }, h('button', { class: 'btn primary', onclick: guard(async () => { await api(`/cases/${c.id}/pack`, {}); render(); }) }, 'Write the pack now')) : null));
    return;
  }
  if (pov === 'newhire' && !c.published) { root.append(h('div', { class: 'empty' }, `${c.person.first}'s handover is still being prepared. ${c.person.manager.split(' ')[0]} has not published it yet.`)); return; }
  const chip = (id) => { const r = c.pack.refs[id]; if (!r) return null; return h('span', { class: 'chip-src ' + r.type }, r.label, h('span', { class: 'pop' }, h('b', null, r.label), ': ', r.text)); };
  const doc = h('div', { class: 'pack' });
  c.pack.sections.forEach(s => {
    doc.append(h('h2', null, s.title));
    s.paragraphs.forEach(p => doc.append(h('p', { class: p.flag ? 'flag' + (p.flag === 'owner' ? ' ok' : '') : '' }, p.text, (p.cites || []).map(chip))));
    if (s.links) doc.append(h('div', { class: 'att' }, s.links.map(l => l.type === 'video' ? h('video', { src: l.url, controls: true }) : h('a', { href: l.url, target: '_blank' }, l.name))));
  });
  const unowned = c.stats.needsOwner;
  const bar = pov === 'manager' ? h('div', { class: unowned && !c.published ? 'banner' : 'banner ok' },
    c.published ? 'Published. The new hire can now use it.' : unowned ? `${unowned} items still have no new owner. You can publish anyway, but they will be marked as open.` : 'Every handoff has an owner. Ready to publish.',
    !c.published ? h('div', { style: 'margin-top:10px' }, h('button', { class: 'btn primary', onclick: guard(async () => { await api(`/cases/${c.id}/publish`, {}); toast('Published'); render(); }) }, 'Approve and publish')) : null)
    : pov === 'leaver' ? h('div', { class: 'banner' }, 'Please read this once. Remove anything wrong or private before your manager publishes it.',
      h('div', { style: 'margin-top:10px' }, h('button', { class: 'btn sm', onclick: guard(async () => { await api(`/cases/${c.id}/pack`, {}); toast('Pack rewritten from your latest answers'); render(); }) }, 'Rewrite from latest answers'))) : null;
  root.append(bar, doc);
}

// Ask
async function askTab(root, c) {
  if (!c.published) { root.append(h('div', { class: 'empty' }, `${c.person.first}'s handover is still being prepared. Questions open once it is published.`)); return; }
  const inp = h('input', { type: 'text', placeholder: `Ask ${c.person.first}'s handover anything` });
  const out = h('div');
  const draw = () => { out.replaceChildren(...S.asks.slice().reverse().map(a => h('div', { class: 'qa' }, h('div', { class: 'q' }, a.q),
    h('div', { class: a.r.covered ? '' : 'nc' }, a.r.covered ? a.r.answer : [h('span', { class: 'tag owner' }, 'Not covered'), ' ', a.r.answer]),
    a.r.cites && a.r.cites.length ? h('div', { class: 'small faint', style: 'margin-top:6px' }, 'Source: ', a.r.cites.map(x => `${x.label}: "${x.text.slice(0, 80)}${x.text.length > 80 ? '…' : ''}"`).join('; ')) : null))); };
  const send = guard(async q => { q = (q || inp.value).trim(); if (!q) return; inp.value = ''; S.asks.push({ q, r: await api(`/cases/${c.id}/ask`, { question: q }) }); draw(); });
  inp.addEventListener('keydown', e => e.key === 'Enter' && send());
  const sug = c.id === 'priya' ? ['How do I run the quarter-end reconciliation script?', 'What breaks first in billing-sync?', 'What is the office wifi password?'] : ['How do I decide on a production access request?', 'What happens at the release go/no-go?', 'What is the office wifi password?'];
  root.append(h('h2', { class: 'h2big' }, `What do you need to know about ${c.person.first}’s work?`),
    h('div', { class: 'askbar' }, inp, h('button', { class: 'btn primary', onclick: () => send() }, 'Ask')),
    h('div', { class: 'chips' }, sug.map(s => h('button', { onclick: () => send(s) }, s))), out);
  draw();
}

// Backfill
async function backfillTab(root, c, pov) {
  const b = c.backfill || await api(`/cases/${c.id}/backfill`, {});
  const copy = guard(async () => { await navigator.clipboard.writeText(b.markdown); toast('Copied as a job description'); });
  root.append(h('div', { class: 'headrow' },
    h('div', { style: 'max-width:620px' }, h('p', { class: 'small faint' }, 'Suggested role for the backfill'), h('h2', null, b.title), h('p', { class: 'sentence' }, b.summary)),
    h('div', { class: 'row' }, h('button', { class: 'btn', onclick: guard(async () => { c.backfill = null; await api(`/cases/${c.id}/backfill`, {}); render(); toast('Recalculated'); }) }, 'Work it out again'), h('button', { class: 'btn primary', onclick: copy }, 'Copy as job description'))));
  b.groups.forEach(g => root.append(h('div', { class: 'skillgrp' }, h('h3', { style: 'margin-bottom:6px' }, g.label),
    g.skills.map(s => h('div', { class: 'skill' }, h('div', { class: 'n' }, s.name), h('span', { class: 'tag ' + s.level }, s.level === 'must' ? 'Must-have' : 'Nice-to-have'), h('div', { class: 'e' }, 'From ' + s.evidence.join(', ')))))));
}

// Onboarding kit
async function kitTab(root, c, pov) {
  const k = c.onboarding || await api(`/cases/${c.id}/onboarding`, {});
  if (!c.published && pov === 'newhire') { root.append(h('div', { class: 'empty' }, `${c.person.first}'s handover is still being prepared. Your plan appears once it is published.`)); return; }
  const md = `# ${k.title}\n\n` + k.phases.map(p => `## ${p.label}\n` + p.tasks.map(t => `- [ ] ${t.text}`).join('\n')).join('\n\n');
  root.append(h('div', { class: 'headrow' },
    h('div', { style: 'max-width:620px' }, h('h2', null, k.title), h('p', { class: 'sentence' }, 'Built from the previous owner’s real work, to run alongside the standard company onboarding.')),
    h('div', { class: 'row' }, pov === 'manager' ? h('button', { class: 'btn', onclick: guard(async () => { await api(`/cases/${c.id}/onboarding`, {}); render(); }) }, 'Rebuild') : null,
      h('button', { class: 'btn primary', onclick: guard(async () => { await navigator.clipboard.writeText(md); toast('Copied as a checklist'); }) }, 'Copy as checklist'))));
  k.phases.forEach(p => root.append(h('div', { class: 'phase' }, h('h3', null, p.label), p.tasks.length ? p.tasks.map(t => {
    const cb = h('input', { type: 'checkbox', onchange: guard(async e => { row.classList.toggle('done', e.target.checked); await api(`/cases/${c.id}/tasks/${t.id}`, { done: e.target.checked }); }) });
    cb.checked = !!c.done[t.id];
    const row = h('label', { class: 'task' + (cb.checked ? ' done' : '') }, cb, h('span', null, t.text)); return row;
  }) : h('p', { class: 'faint small' }, 'Nothing here for this role.'))));
}

// ---------- render
async function render() {
  const { parts, q } = parse();
  const app = $('#app');
  const y = window.scrollY;
  try {
    let el;
    if (parts[0] === 'connections') el = await connections();
    else if (parts[0] === 'departures') el = await departures();
    else if (parts[0] === 'case') el = await casePage(parts[1], q.get('as') || 'manager', q.get('tab') || 'own');
    else el = await home();
    const same = S.lastPath === parts.join('/');
    S.lastPath = parts.join('/');
    app.replaceChildren(el);
    if (!parts.length) afterLanding(el);
    if (parts[0] === 'departures') afterDepartures(el);
    window.scrollTo(0, same ? y : 0);
  } catch (e) { app.replaceChildren(shell('home', h('div', { class: 'empty' }, h('h2', null, 'Something went wrong'), h('p', null, e.message)))); }
}
render();
