import { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useStores } from '../store.jsx';
import { useAuth } from '../auth.jsx';
import StoreSwitcher from './StoreSwitcher.jsx';
import LangSwitch from './LangSwitch.jsx';
import { useI18n } from '../i18n.jsx';

const icon = (paths) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {paths.map((d) => <path key={d} d={d} />)}
  </svg>
);

const ITEMS = [
  { to: '/', label: 'nav.assistant', end: true, icon: ['M4 5h16v11H9l-5 4z'] },
  { to: '/costs', label: 'nav.costs', icon: ['M12 3l9 5-9 5-9-5z', 'M3 13l9 5 9-5'] },
  { to: '/supply', label: 'nav.supply', icon: ['M3 7l9-4 9 4v10l-9 4-9-4z', 'M3 7l9 4 9-4M12 11v10'] },
  { to: '/shops', label: 'nav.shops', icon: ['M4 9h16l-1-5H5z', 'M5 9v11h14V9', 'M10 20v-6h4v6'] },
  { to: '/sold-log', label: 'nav.soldLog', icon: ['M6 3h12v18l-3-2-3 2-3-2-3 2z', 'M9 8h6M9 12h6'] },
  { to: '/dashboard', label: 'nav.dashboard', icon: ['M4 4v16h16', 'M8 16v-5M12 16V8M16 16v-3'] },
];

export default function Sidebar() {
  const { refresh } = useStores();
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const { pathname } = useLocation();
  // keep the "N shops · N products" counts in the switcher fresh as you move around
  useEffect(() => {
    refresh().catch(() => {});
  }, [pathname, refresh]);

  return (
    <nav className="sidebar" aria-label={t('nav.main')}>
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">฿</div>
        <div>
          <span className="brand-name">Bak3rMate</span>
          <span className="brand-sub">{t('brand.sub')}</span>
        </div>
      </div>
      <StoreSwitcher />
      <div className="nav">
        {ITEMS.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => (isActive ? 'active' : '')}>
            {icon(i.icon)}
            {t(i.label)}
          </NavLink>
        ))}
      </div>
      <div className="account">
        <LangSwitch variant="dark" />
        <span className="account-name" title={user.email}>{user.name || user.email}</span>
        {user.name && <span className="account-mail">{user.email}</span>}
        <button className="btn" onClick={logout}>{t('account.logout')}</button>
      </div>
    </nav>
  );
}
