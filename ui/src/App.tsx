import { Link, NavLink, Route, Routes } from 'react-router-dom';
import CasePage from './pages/CasePage';
import ConnectionsPage from './pages/ConnectionsPage';
import HomePage from './pages/HomePage';

export default function App() {
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link to="/" className="wordmark">
          handover<span>.ai</span>
        </Link>
        <nav>
          <NavLink to="/" end>
            Departures
          </NavLink>
          <NavLink to="/connections">Connections</NavLink>
        </nav>
        <p className="sidebar-foot">Knowledge that stays when people leave.</p>
      </aside>
      <main className="canvas">
        <div className="wrap">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/cases/:caseId" element={<CasePage />} />
            <Route path="/connections" element={<ConnectionsPage />} />
            <Route
              path="*"
              element={
                <p className="muted">
                  This page doesn&apos;t exist. <Link to="/">Go to departures</Link>.
                </p>
              }
            />
          </Routes>
        </div>
      </main>
    </div>
  );
}
