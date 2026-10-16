import { useEffect, useState } from 'react';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import LangSwitch from '../components/LangSwitch.jsx';

const GOOGLE_ERRORS = { google_denied: 'login.googleDenied', google_failed: 'login.googleFailed', google_off: 'login.googleOff' };

export default function Login() {
  const { t } = useI18n();
  const { config, login, register } = useAuth();
  const [mode, setMode] = useState('login'); // login | signup
  const [form, setForm] = useState({ email: '', password: '', name: '' });
  const [sample, setSample] = useState(true);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Google sends people back here with ?login_error=... when something went wrong
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('login_error');
    if (code) {
      setError(t(GOOGLE_ERRORS[code] || 'login.failed'));
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'login') await login(form.email, form.password);
      else await register({ email: form.email, password: form.password, name: form.name, start_with: sample ? 'sample' : 'empty' });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const signup = mode === 'signup';

  return (
    <div className="login-page">
      <div className="card login-card">
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}><LangSwitch /></div>
        <div className="brand" style={{ padding: 0 }}>
          <div className="brand-mark" aria-hidden="true">฿</div>
          <div>
            <span className="brand-name" style={{ color: 'var(--ink)' }}>Bak3rMate</span>
            <span className="brand-sub" style={{ color: 'var(--muted)' }}>{t('brand.sub')}</span>
          </div>
        </div>

        <div className="seg" role="tablist" aria-label={t('login.tabsAria')}>
          <button type="button" role="tab" aria-selected={!signup} onClick={() => { setMode('login'); setError(''); }}>{t('login.logIn')}</button>
          <button type="button" role="tab" aria-selected={signup} onClick={() => { setMode('signup'); setError(''); }}>{t('login.createAccount')}</button>
        </div>

        {error && <div className="error" role="alert">{error}</div>}

        {config.google && (
          <>
            <a className="btn google" href={`/api/auth/google?start=${signup && !sample ? 'empty' : 'sample'}`}>
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
                <path fill="#FBBC05" d="M10.5 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z" />
                <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
              </svg>
              {t('login.google')}
            </a>
            <div className="or"><span>{t('login.orEmail')}</span></div>
          </>
        )}

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {signup && (
            <label className="field">{t('login.yourName')} <span className="muted" style={{ fontWeight: 400 }}>{t('login.optional')}</span>
              <input className="input" autoComplete="name" maxLength={60} value={form.name} onChange={set('name')} />
            </label>
          )}
          <label className="field">{t('login.email')}
            <input className="input" type="email" required autoComplete="email" value={form.email} onChange={set('email')} />
          </label>
          <label className="field">{t('login.password')}
            <span style={{ display: 'flex', gap: 8 }}>
              <input
                className="input"
                style={{ flex: 1 }}
                type={show ? 'text' : 'password'}
                required
                minLength={signup ? 8 : undefined}
                maxLength={200}
                autoComplete={signup ? 'new-password' : 'current-password'}
                value={form.password}
                onChange={set('password')}
              />
              <button type="button" className="btn" onClick={() => setShow(!show)} aria-pressed={show}>{show ? t('common.hide') : t('common.show')}</button>
            </span>
            {signup && <span className="muted" style={{ fontWeight: 400 }}>{t('login.min8')}</span>}
          </label>
          {signup && (
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14 }}>
              <input className="chk" type="checkbox" checked={sample} onChange={(e) => setSample(e.target.checked)} style={{ marginTop: 2 }} />
              <span>{t('login.sample')}</span>
            </label>
          )}
          <button className="btn primary" type="submit" disabled={busy}>{busy ? t('common.wait') : signup ? t('login.createAccount') : t('login.logIn')}</button>
        </form>
      </div>
    </div>
  );
}
