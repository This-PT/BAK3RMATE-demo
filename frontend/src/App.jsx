import { Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth.jsx';
import { I18nProvider, useI18n } from './i18n.jsx';
import { ChatProvider } from './chat.jsx';
import { StoreProvider, useStores } from './store.jsx';
import Login from './pages/Login.jsx';
import Sidebar from './components/Sidebar.jsx';
import Assistant from './pages/Assistant.jsx';
import Costs from './pages/Costs.jsx';
import Supply from './pages/Supply.jsx';
import Shops from './pages/Shops.jsx';
import SoldLog from './pages/SoldLog.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Stores from './pages/Stores.jsx';

function Shell() {
  const { current, error, refresh } = useStores();
  const { t } = useI18n();
  if (error) {
    return (
      <div className="main">
        <div className="error">{t('app.loadError', { error })}</div>
        <button className="btn" onClick={() => refresh().catch(() => {})}>{t('common.tryAgain')}</button>
      </div>
    );
  }
  if (!current) return null;
  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        {/* keyed by store: switching store remounts the page, so everything reloads for the new store */}
        <ChatProvider key={current.id}>
        <Routes key={current.id}>
          <Route path="/" element={<Assistant />} />
          <Route path="/costs" element={<Costs />} />
          <Route path="/supply" element={<Supply />} />
          <Route path="/shops" element={<Shops />} />
          <Route path="/sold-log" element={<SoldLog />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/stores" element={<Stores />} />
        </Routes>
        </ChatProvider>
      </main>
    </div>
  );
}

// Shows the login page until someone is logged in; each person gets their own stores.
function Gate() {
  const { user } = useAuth();
  if (user === undefined) return null; // still checking whether a login exists
  if (!user) return <Login />;
  return (
    <StoreProvider key={user.id}>
      <Shell />
    </StoreProvider>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </I18nProvider>
  );
}
