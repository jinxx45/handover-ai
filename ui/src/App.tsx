import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import CasePage from './pages/CasePage';
import ConnectionsPage from './pages/ConnectionsPage';
import DeparturesPage from './pages/DeparturesPage';
import OverviewPage from './pages/OverviewPage';

/** The nav turns dark while it sits over a black section of the overview page. */
function useDarkNav(enabled: boolean) {
  const [dark, setDark] = useState(enabled);
  useEffect(() => {
    if (!enabled) {
      setDark(false);
      return;
    }
    const onScroll = () => {
      const y = window.scrollY + 26;
      const under = [...document.querySelectorAll<HTMLElement>('.sec')].find((s) => s.offsetTop <= y && y < s.offsetTop + s.offsetHeight);
      setDark(!!under && under.classList.contains('black'));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [enabled]);
  return dark;
}

export default function App() {
  const { pathname } = useLocation();
  const overview = pathname === '/';
  const dark = useDarkNav(overview);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <>
      <header className={`topnav ${dark ? 'dark' : ''}`}>
        <Link to="/" className="wordmark">
          <i aria-hidden="true" />
          handover.ai
        </Link>
        <nav aria-label="Main">
          <NavLink to="/" end>
            Overview
          </NavLink>
          <NavLink to="/departures">Departures</NavLink>
          <NavLink to="/connections">Connections</NavLink>
        </nav>
      </header>
      <main className={overview ? 'page bare' : 'page'}>
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/departures" element={<DeparturesPage />} />
          <Route path="/cases/:caseId" element={<CasePage />} />
          <Route path="/connections" element={<ConnectionsPage />} />
          <Route
            path="*"
            element={
              <p className="empty">
                This page doesn&apos;t exist. <Link to="/departures">Go to departures</Link>.
              </p>
            }
          />
        </Routes>
      </main>
    </>
  );
}
