import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useStores } from '../store.jsx';
import { baht } from '../format.js';
import { api } from '../api.js';
import TrashList from '../components/TrashList.jsx';
import { shortDate } from '../dates.js';

function NewStoreModal({ stores, currentId, onClose, onCreate }) {
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
            <h2 id="new-store-title">New store</h2>
            <p>A store is one business. It has its own supplies, products, shops and sold log.</p>
          </div>
          <button type="button" className="btn ghost" onClick={onClose} aria-label="Close" disabled={saving}>✕</button>
        </div>
        <div className="modal-body">
          {error && <div className="error">{error}</div>}
          <label className="field">Store name
            <input className="input" type="text" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mali Snacks" />
          </label>
          <fieldset className="preset-list" style={{ gridTemplateColumns: '1fr' }}>
            <legend className="sr-only">Start with</legend>
            <label className={`preset ${mode === 'empty' ? 'on' : ''}`}>
              <input type="radio" name="mode" checked={mode === 'empty'} onChange={() => setMode('empty')} />
              <span className="preset-main"><strong>Start empty</strong><span className="muted preset-sum">Add your own supplies and products.</span></span>
            </label>
            <label className={`preset ${mode === 'copy' ? 'on' : ''}`}>
              <input type="radio" name="mode" checked={mode === 'copy'} onChange={() => setMode('copy')} />
              <span className="preset-main">
                <strong>Copy another store</strong>
                <span className="muted preset-sum">Supplies, products, recipes, shops and prices. The sold log is not copied.</span>
                <select className="input" value={copyFrom} onChange={(e) => { setCopyFrom(e.target.value); setMode('copy'); }} aria-label="Store to copy">
                  {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </span>
            </label>
          </fieldset>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving || !name.trim()}>{saving ? 'Creating…' : 'Create store'}</button>
        </div>
      </form>
    </div>
  );
}

function StoreCard({ store, isCurrent, canDelete, onOpen, onRename, onDelete }) {
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
              aria-label="Store name"
              onChange={(e) => setName(e.target.value)}
              onBlur={save}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') { setName(store.name); setEditing(false); }
              }}
            />
          ) : (
            <h2>{store.name} {isCurrent && <span className="badge ok">Open now</span>}</h2>
          )}
          <span className="muted" style={{ fontSize: 13 }}>
            {store.shop_count} {store.shop_count === 1 ? 'shop' : 'shops'} · {store.product_count} {store.product_count === 1 ? 'product' : 'products'} · {store.supply_count} supplies
          </span>
        </div>
      </div>
      <div className="store-month">
        <span className="muted">This month</span>
        <span><b className="mono">{baht(store.month.profit)}</b> <span className="muted">profit on {store.month.units} sold</span></span>
      </div>
      <div className="store-actions">
        <button className="btn primary" onClick={() => onOpen(store.id)} disabled={isCurrent}>{isCurrent ? 'Open' : 'Open store'}</button>
        <button className="btn" onClick={() => setEditing(true)}>Rename</button>
        <button className="btn danger" onClick={() => onDelete(store)} disabled={!canDelete} title={canDelete ? undefined : 'You need at least one store'}>Delete</button>
      </div>
    </article>
  );
}

export default function Stores() {
  const { stores, current, select, create, rename, remove, refresh } = useStores();
  const [deleted, setDeleted] = useState([]);
  const loadDeleted = () => api.get('/api/stores/deleted').then(setDeleted).catch(() => {});
  useEffect(() => { loadDeleted(); }, []);
  const navigate = useNavigate();
  const location = useLocation();
  const [showNew, setShowNew] = useState(!!location.state?.create);
  const [error, setError] = useState('');

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
    if (!window.confirm(`Delete "${store.name}"?\n\nIt is hidden with everything in it (${store.shop_count} shops, ${store.product_count} products, ${store.supply_count} supplies and its sold log). You can restore it from "Deleted stores" on this page.`)) return;
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
          <h1>Stores</h1>
          <p>Each store is a separate business with its own supplies, products, shops and sold log. Pick one from the menu at the top left to work in it.</p>
        </div>
        <button className="btn primary" onClick={() => setShowNew(true)}>+ New store</button>
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
        title="Deleted stores"
        items={deleted.map((d) => ({ id: d.id, title: d.name, detail: `${d.shop_count} shops · ${d.product_count} products · deleted ${shortDate(d.deleted_at)}` }))}
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
