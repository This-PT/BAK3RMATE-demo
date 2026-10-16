import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStores } from '../store.jsx';
import { useI18n } from '../i18n.jsx';

// The store menu at the top of the sidebar: switch store, add one, or manage them.
export default function StoreSwitcher() {
  const { stores, current, select } = useStores();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => !box.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  if (!current) return null;

  return (
    <div className="store-switch" ref={box}>
      <button className="store-btn" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="store-ico" aria-hidden="true">{current.name.trim().charAt(0).toUpperCase()}</span>
        <span className="store-text">
          <b>{current.name}</b>
          <small>{t('count.shops', { n: current.shop_count })} · {t('count.products', { n: current.product_count })}</small>
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 9l5-5 5 5M7 15l5 5 5-5" /></svg>
      </button>
      {open && (
        <div className="store-menu" aria-label={t('store.yourStores')}>
          {stores.map((s) => (
            <button
              key={s.id}
              className={`store-item ${s.id === current.id ? 'on' : ''}`}
              aria-current={s.id === current.id ? 'true' : undefined}
              onClick={() => { select(s.id); setOpen(false); }}
            >
              <span className="store-ico sm" aria-hidden="true">{s.name.trim().charAt(0).toUpperCase()}</span>
              <span className="store-text"><b>{s.name}</b></span>
              {s.id === current.id && <span aria-hidden="true">✓</span>}
            </button>
          ))}
          <div className="store-sep" />
          <button className="store-item" onClick={() => { setOpen(false); navigate('/stores', { state: { create: true } }); }}>{t('store.newPlus')}</button>
          <Link className="store-item" to="/stores" onClick={() => setOpen(false)}>{t('store.manage')}</Link>
        </div>
      )}
    </div>
  );
}
