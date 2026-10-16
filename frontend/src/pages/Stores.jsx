import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useStores } from '../store.jsx';
import { baht } from '../format.js';
import { api } from '../api.js';
import TrashList from '../components/TrashList.jsx';
import { shortDate } from '../dates.js';
import { useI18n } from '../i18n.jsx';
import { usePlan } from '../plan.jsx';

function NewStoreModal({ stores, currentId, onClose, onCreate }) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [mode, setMode] = useState('empty'); // empty | copy
  const [copyFrom, setCopyFrom] = useState(String(currentId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef(null);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !saving && onClose();
    document.addEventListener('keydown', onKey);
    dialog.current?.querySelector('input[type=text]')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [saving, onClose]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onCreate(name.trim(), mode === 'copy' ? Number(copyFrom) : null);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !saving && onClose()}>
      <form className="modal" style={{ width: 'min(560px, 100%)' }} role="dialog" aria-modal="true" aria-labelledby="new-store-title" ref={dialog} onSubmit={submit}>
        <div className="modal-head">
          <div>
            <h2 id="new-store-title">{t('store.newTitle')}</h2>
            <p>{t('store.newHelp')}</p>
          </div>
          <button type="button" className="btn ghost" onClick={onClose} aria-label={t('common.close')} disabled={saving}>✕</button>
        </div>
        <div className="modal-body">
          {error && <div className="error">{error}</div>}
          <label className="field">{t('store.name')}
            <input className="input" type="text" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('store.namePlaceholder')} />
          </label>
          <fieldset className="preset-list" style={{ gridTemplateColumns: '1fr' }}>
            <legend className="sr-only">{t('store.startWith')}</legend>
            <label className={`preset ${mode === 'empty' ? 'on' : ''}`}>
              <input type="radio" name="mode" checked={mode === 'empty'} onChange={() => setMode('empty')} />
              <span className="preset-main"><strong>{t('store.startEmpty')}</strong><span className="muted preset-sum">{t('store.startEmptyHelp')}</span></span>
            </label>
            <label className={`preset ${mode === 'copy' ? 'on' : ''}`}>
              <input type="radio" name="mode" checked={mode === 'copy'} onChange={() => setMode('copy')} />
              <span className="preset-main">
                <strong>{t('store.copyAnother')}</strong>
                <span className="muted preset-sum">{t('store.copyHelp')}</span>
                <select className="input" value={copyFrom} onChange={(e) => { setCopyFrom(e.target.value); setMode('copy'); }} aria-label={t('store.toCopy')}>
                  {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </span>
            </label>
          </fieldset>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose} disabled={saving}>{t('common.cancel')}</button>
          <button type="submit" className="btn primary" disabled={saving || !name.trim()}>{saving ? t('store.creating') : t('store.create')}</button>
        </div>
      </form>
    </div>
  );
}

function StoreCard({ store, isCurrent, canDelete, onOpen, onRename, onDelete }) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(store.name);

  const save = async () => {
    const next = name.trim();
    setEditing(false);
    if (next && next !== store.name) await onRename(store.id, next);
    else setName(store.name);
  };

  return (
    <article className={`card store-card ${isCurrent ? 'current' : ''}`}>
      <div className="store-card-head">
        <span className="store-ico lg" aria-hidden="true">{store.name.trim().charAt(0).toUpperCase()}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          {editing ? (
            <input
              className="input"
              style={{ width: '100%' }}
              autoFocus
              maxLength={60}
              value={name}
              aria-label={t('store.name')}
              onChange={(e) => setName(e.target.value)}
              onBlur={save}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') { setName(store.name); setEditing(false); }
              }}
            />
          ) : (
            <h2>{store.name} {isCurrent && <span className="badge ok">{t('store.openNow')}</span>}</h2>
          )}
          <span className="muted" style={{ fontSize: 13 }}>
            {t('count.shops', { n: store.shop_count })} · {t('count.products', { n: store.product_count })} · {t('count.supplies', { n: store.supply_count })}
          </span>
        </div>
      </div>
      <div className="store-month">
        <span className="muted">{t('store.thisMonth')}</span>
        <span><b className="mono">{baht(store.month.profit)}</b> <span className="muted">{t('store.profitOn', { n: store.month.units })}</span></span>
      </div>
      <div className="store-actions">
        <button className="btn primary" onClick={() => onOpen(store.id)} disabled={isCurrent}>{isCurrent ? t('store.open') : t('store.openStore')}</button>
        <button className="btn" onClick={() => setEditing(true)}>{t('common.rename')}</button>
        <button className="btn danger" onClick={() => onDelete(store)} disabled={!canDelete} title={canDelete ? undefined : t('store.needOne')}>{t('common.delete')}</button>
      </div>
    </article>
  );
}

export default function Stores() {
  const { t } = useI18n();
  const { stores, current, select, create, rename, remove, refresh } = useStores();
  const [deleted, setDeleted] = useState([]);
  const loadDeleted = () => api.get('/api/stores/deleted').then(setDeleted).catch(() => {});
  useEffect(() => { loadDeleted(); }, []);
  const navigate = useNavigate();
  const location = useLocation();
  const { plan, storeLimit } = usePlan();
  const atLimit = stores.length >= storeLimit;
  const [showNew, setShowNew] = useState(!!location.state?.create && !atLimit);
  const [error, setError] = useState(location.state?.create && atLimit ? limitMsg() : '');
  function limitMsg() {
    return t('plan.limitHit', { plan: t(`plan.${plan}Short`), max: storeLimit });
  }
  const tryNew = () => {
    if (atLimit) setError(limitMsg());
    else { setError(''); setShowNew(true); }
  };

  const open = (id) => {
    select(id);
    navigate('/dashboard');
  };

  const makeStore = async (name, copyFrom) => {
    await create(name, copyFrom);
    navigate('/dashboard');
  };

  const doRename = async (id, name) => {
    setError('');
    try {
      await rename(id, name);
    } catch (e) {
      setError(e.message);
    }
  };

  const doDelete = async (store) => {
    if (!window.confirm(t('store.confirmDelete', { name: store.name, shops: store.shop_count, products: store.product_count, supplies: store.supply_count }))) return;
    setError('');
    try {
      await remove(store.id);
      await loadDeleted();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <>
      <header className="page-head">
        <div>
          <h1>{t('store.pageTitle')}</h1>
          <p>{t('store.pageHelp')}</p>
        </div>
        <button className="btn primary" onClick={tryNew}>{t('store.newPlus')}</button>
      </header>
      {error && <div className="error">{error}</div>}

      <div className="store-grid">
        {stores.map((s) => (
          <StoreCard
            key={s.id}
            store={s}
            isCurrent={s.id === current.id}
            canDelete={stores.length > 1}
            onOpen={open}
            onRename={doRename}
            onDelete={doDelete}
          />
        ))}
      </div>

      <TrashList
        title={t('store.deletedTitle')}
        items={deleted.map((d) => ({ id: d.id, title: d.name, detail: t('store.deletedDetail', { shops: d.shop_count, products: d.product_count, date: shortDate(d.deleted_at) }) }))}
        onRestore={async (it) => {
          setError('');
          try {
            await api.post(`/api/stores/${it.id}/restore`);
            await Promise.all([refresh(), loadDeleted()]);
          } catch (e) {
            setError(e.message);
          }
        }}
      />

      {showNew && <NewStoreModal stores={stores} currentId={current.id} onClose={() => setShowNew(false)} onCreate={makeStore} />}
    </>
  );
}
