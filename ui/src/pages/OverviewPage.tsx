import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Spinner } from '../components/ui';

/** Splits a headline into words that arrive one after another. */
function Words({ text, delay = 0 }: { text: string; delay?: number }) {
  return (
    <>
      {text.split(' ').map((w, i) => (
        <span key={i}>
          <span className="word" style={{ animationDelay: `${delay + i * 0.08}s` }}>
            {w}
          </span>{' '}
        </span>
      ))}
    </>
  );
}

/** Reveals .rv elements as they scroll into view, and counts up [data-count] numbers. */
function useReveal(root: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const count = (n: HTMLElement) => {
      const to = Number(n.dataset.count), unit = n.dataset.unit ?? '', t0 = performance.now();
      const step = (t: number) => {
        const p = Math.min((t - t0) / 1400, 1);
        n.textContent = Math.round(to * (1 - Math.pow(1 - p, 4))) + unit;
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add('in');
          io.unobserve(e.target);
          e.target.querySelectorAll<HTMLElement>('[data-count]').forEach(count);
        }),
      { threshold: 0.25 },
    );
    el.querySelectorAll('.rv').forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [root]);
}

/** The hero window drifts up slightly as you scroll. */
function useDrift(ref: React.RefObject<HTMLElement>) {
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const onScroll = () => {
      const y = window.scrollY;
      if (ref.current) ref.current.style.transform = `translateY(${Math.min(y * -0.12, 0)}px) scale(${1 + Math.min(y / 4000, 0.04)})`;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [ref]);
}

const HERO_BLOCKS = ['captured', 'risk', 'owner', 'owner', 'risk', 'risk', 'risk', 'documented', 'risk'];
const HERO_ROWS: [string, string, string, string][] = [
  ['billing-sync service', 'You wrote 61% of it. No runbook.', 'risk', 'Only in your head'],
  ['Required code reviewer in acme/billing-sync', 'Pull requests wait on you.', 'owner', 'Needs a new owner'],
  ['Quarter-end revenue reconciliation', 'Captured in your interview.', 'captured', 'Captured'],
];

export default function OverviewPage() {
  const navigate = useNavigate();
  const root = useRef<HTMLDivElement>(null);
  const device = useRef<HTMLDivElement>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useReveal(root);
  useDrift(device);

  async function resign(personId: string) {
    setStarting(personId);
    setError(null);
    try {
      const created = await api.depart(personId);
      navigate(`/cases/${created.id}?as=leaver`);
    } catch (e) {
      setError(`Couldn't start the handover: ${(e as Error).message}`);
      setStarting(null);
    }
  }

  return (
    <div ref={root}>
      <section className="sec black hero">
        <h1>
          <Words text="Nothing walks out the door." delay={0.1} />
        </h1>
        <p className="lede rv" style={{ ['--d' as string]: '.7s' }}>
          When someone resigns, handover.ai finds what only they know, asks them about it, and gets the next person ready.
        </p>
        <div className="ctas rv" style={{ ['--d' as string]: '.9s' }}>
          <button className="btn lg" disabled={starting !== null} onClick={() => resign('priya')}>
            {starting === 'priya' && <Spinner />} Watch Priya resign
          </button>
          <Link to="/departures">See all departures</Link>
        </div>
        <div className="device" ref={device} aria-hidden="true">
          <div className="bar">
            <i />
            <i />
            <i />
          </div>
          <div className="t">Priya Raman, senior software engineer. 14 days left.</div>
          <div className="big">Priya owns 9 things. Most of it lives only in her head.</div>
          <div className="strip">
            {HERO_BLOCKS.map((b, n) => (
              <i key={n} className={b} style={{ ['--n' as string]: n }} />
            ))}
          </div>
          <div className="rows">
            {HERO_ROWS.map(([t, s, k, l], n) => (
              <div className="r" key={t} style={{ ['--n' as string]: n }}>
                <div>
                  {t}
                  <small>{s}</small>
                </div>
                <span className={`pillt ${k}`}>{l}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec white">
        <h2 className="rv">It already knows what&rsquo;s theirs.</h2>
        <p className="lede rv" style={{ ['--d' as string]: '.1s' }}>
          GitHub, Jira, Confluence, Drive, Calendar and PagerDuty report what a person owns the moment Workday says they&rsquo;re leaving.
        </p>
        <div className="stats">
          {(
            [
              [61, '%', 'of billing-sync was written by one engineer'],
              [46, '', 'production access requests one manager approved'],
              [8, '', 'people whose time off routes to that same manager'],
            ] as const
          ).map(([n, u, l], i) => (
            <div className="stat rv" key={l} style={{ ['--d' as string]: `${0.1 + i * 0.12}s` }}>
              <b data-count={n} data-unit={u}>
                0{u}
              </b>
              <span>{l}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="sec fog">
        <h2 className="rv">It only asks what isn&rsquo;t written down.</h2>
        <p className="lede rv" style={{ ['--d' as string]: '.1s' }}>
          Riskiest first. Type, talk, or record your screen. Vague answers get a follow-up.
        </p>
        <div className="mock">
          <div className="bub q rv">The quarter-end reconciliation runs once a quarter. What are the steps, and how do you know it worked?</div>
          <div className="bub a rv" style={{ ['--d' as string]: '.35s' }}>
            Run it after the finance freeze, then check the totals match the ledger.
          </div>
          <div className="bub fu rv" style={{ ['--d' as string]: '.7s' }}>
            Can you give one example of a time it went wrong?
          </div>
        </div>
      </section>

      <section className="sec black">
        <h2 className="rv">
          <span className="grad">Every fact shows its source.</span>
        </h2>
        <p className="fact rv" style={{ ['--d' as string]: '.15s' }}>
          The reconciliation must run after the finance freeze, or the totals drift.<sup>Interview</sup> Priya wrote 92% of the script.
          <sup className="g">GitHub</sup>
        </p>
        <p className="lede rv" style={{ ['--d' as string]: '.3s' }}>
          And when the answer isn&rsquo;t in the handover, it says so instead of guessing.
        </p>
      </section>

      <section className="sec fog">
        <h2 className="rv">The next hire starts where she left off.</h2>
        <p className="lede rv" style={{ ['--d' as string]: '.1s' }}>
          A job description built from the real work, and a 90-day plan built for one person, not the whole team.
        </p>
        <ul className="kitmock rv">
          {['Meet Ravi Kumar, the Finance controller Priya works with.', 'Shadow, then run, the quarter-end reconciliation.', 'Take over the billing-sync code reviews.'].map((t) => (
            <li key={t}>
              <i aria-hidden="true" />
              {t}
            </li>
          ))}
        </ul>
      </section>

      <section className="sec black try">
        <h2 className="rv">Try it.</h2>
        <p className="lede rv" style={{ ['--d' as string]: '.1s' }}>
          Each button sends the same resignation event Workday would.
        </p>
        <div className="row rv" style={{ ['--d' as string]: '.2s' }}>
          <button className="btn lg" disabled={starting !== null} onClick={() => resign('priya')}>
            {starting === 'priya' && <Spinner />} Priya resigns
          </button>
          <button className="btn lg on-dark" disabled={starting !== null} onClick={() => resign('meera')}>
            {starting === 'meera' && <Spinner />} Meera, a manager, resigns
          </button>
        </div>
        {error && (
          <p className="note error" style={{ maxWidth: 560, margin: '28px auto 0' }}>
            {error}
          </p>
        )}
      </section>
      <footer className="foot">handover.ai. Built at the Chennai hackathon.</footer>
    </div>
  );
}
