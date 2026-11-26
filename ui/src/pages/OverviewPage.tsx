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

const HERO_BLOCKS = ['captured', 'risk', 'owner', 'owner', 'risk', 'documented', 'risk'];
const HERO_ROWS: [string, string, string, string][] = [
  ['OMS UI (order management web app)', 'You wrote 64% of it. No runbook.', 'risk', 'Only in your head'],
  ['Required reviewer for checkout code', 'Checkout changes wait on you.', 'owner', 'Needs a new owner'],
  ['Weekly OMS UI release', 'Explained in your interview.', 'captured', 'Captured'],
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
          When someone resigns, handover.ai finds the work only they know, interviews them about it, and equips their backfill with the knowledge they need.
        </p>
        <div className="ctas rv" style={{ ['--d' as string]: '.9s' }}>
          <button className="btn lg" disabled={starting !== null} onClick={() => resign('elena')}>
            {starting === 'elena' && <Spinner />} Try it: Elena resigns
          </button>
          <Link to="/departures">See all departures</Link>
        </div>
        <div className="device" ref={device} aria-hidden="true">
          <div className="bar">
            <i />
            <i />
            <i />
          </div>
          <div className="t">Elena Marsh, Senior Software Engineer, OMS UI. 14 days left.</div>
          <div className="big">Elena owns 7 things. Most of them aren&rsquo;t written down.</div>
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
        <h2 className="rv">It finds what they own.</h2>
        <p className="lede rv" style={{ ['--d' as string]: '.1s' }}>
          When Workday records a resignation, handover.ai checks GitHub, Jira, Confluence, Drive, Calendar and PagerDuty for the person&rsquo;s work.
        </p>
        <div className="stats">
          {(
            [
              [64, '%', 'of the OMS UI code was written by one engineer'],
              [17, '', 'production access requests approved by one manager'],
              [6, '', 'people whose time off that same manager approves'],
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
        <h2 className="rv">It asks only about what isn&rsquo;t written down.</h2>
        <p className="lede rv" style={{ ['--d' as string]: '.1s' }}>
          Most important first. Type, speak, or record your screen. If an answer is vague, it asks again.
        </p>
        <div className="mock">
          <div className="bub q rv">You run the weekly OMS UI release. What are the steps, and how do you know it worked?</div>
          <div className="bub a rv" style={{ ['--d' as string]: '.35s' }}>
            Merge to main on Tuesday, tag the release, then check the order list loads.
          </div>
          <div className="bub fu rv" style={{ ['--d' as string]: '.7s' }}>
            Who should you tell if the order list doesn&rsquo;t load?
          </div>
        </div>
      </section>

      <section className="sec black">
        <h2 className="rv">
          <span className="grad">Every fact shows its source.</span>
        </h2>
        <p className="fact rv" style={{ ['--d' as string]: '.15s' }}>
          Release on Tuesday after the 10am code freeze.<sup>Interview</sup> Elena ran 11 of the last 12 releases.
          <sup className="g">GitHub</sup>
        </p>
        <p className="lede rv" style={{ ['--d' as string]: '.3s' }}>
          If the handover doesn&rsquo;t cover something, it says so instead of guessing.
        </p>
      </section>

      <section className="sec fog">
        <h2 className="rv">The next hire starts where she stopped.</h2>
        <p className="lede rv" style={{ ['--d' as string]: '.1s' }}>
          A job description based on the real work, and a 90-day plan for this role, not a generic team plan.
        </p>
        <ul className="kitmock rv">
          {['Meet Grace Holloway, the Order Operations lead Elena works with.', 'Watch one OMS UI release, then run the next one.', 'Take over checkout code reviews.'].map((t) => (
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
          Each button sends the same resignation event that Workday sends.
        </p>
        <div className="row rv" style={{ ['--d' as string]: '.2s' }}>
          <button className="btn lg" disabled={starting !== null} onClick={() => resign('elena')}>
            {starting === 'elena' && <Spinner />} Elena, an engineer, resigns
          </button>
          <button className="btn lg on-dark" disabled={starting !== null} onClick={() => resign('sofia')}>
            {starting === 'sofia' && <Spinner />} Sofia, a manager, resigns
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
