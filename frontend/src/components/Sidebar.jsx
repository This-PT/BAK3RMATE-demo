import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { api } from '../api.js';

const icon = (paths) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {paths.map((d) => <path key={d} d={d} />)}
  </svg>
);

const ITEMS = [
  { to: '/', label: 'AI Assistant', end: true, icon: ['M4 5h16v11H9l-5 4z'] },
  { to: '/costs', label: 'Cost Breakdown', icon: ['M12 3l9 5-9 5-9-5z', 'M3 13l9 5 9-5'] },
  { to: '/supply', label: 'Supply', icon: ['M3 7l9-4 9 4v10l-9 4-9-4z', 'M3 7l9 4 9-4M12 11v10'] },
  { to: '/shops', label: 'Shops', icon: ['M4 9h16l-1-5H5z', 'M5 9v11h14V9', 'M10 20v-6h4v6'] },
  { to: '/sold-log', label: 'Sold Log', icon: ['M6 3h12v18l-3-2-3 2-3-2-3 2z', 'M9 8h6M9 12h6'] },
  { to: '/dashboard', label: 'Dashboard', icon: ['M4 4v16h16', 'M8 16v-5M12 16V8M16 16v-3'] },
];

export default function Sidebar() {
  const [info, setInfo] = useState(null);
  const { pathname } = useLocation();
  useEffect(() => {
    api.get('/api/dashboard').then((d) => setInfo(d.kpis)).catch(() => {});
  }, [pathname]);

  return (
    <nav className="sidebar" aria-label="Main">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">฿</div>
        <div>
          <span className="brand-name">Kumtun</span>
          <span className="brand-sub">คุ้มทุน · true cost for sellers</span>
        </div>
      </div>
      <div className="nav">
        {ITEMS.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => (isActive ? 'active' : '')}>
            {icon(i.icon)}
            {i.label}
          </NavLink>
        ))}
      </div>
      <div className="side-foot">
        <b>Baan Brownie</b>
        {info && <span>{info.shops} shops · {info.products_tracked} products</span>}
      </div>
    </nav>
  );
}
