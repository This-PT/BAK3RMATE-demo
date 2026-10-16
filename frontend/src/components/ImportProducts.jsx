import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useStores } from '../store.jsx';
import { useI18n } from '../i18n.jsx';

// Pick products one by one from another store. Each comes with its recipe; ingredients you don't have yet are copied too.
export default function ImportProducts({ haveNames, onDone, onCancel }) {
  const { t } = useI18n();
  const { stores, current } = useStores();
  const others = stores.filter((s) => s.id !== current.id);
  const [fromId, setFromId] = useState(String(others[0]?.id ?? ''));
  const [source, setSource] = useState(null);
  const [picked, setPicked] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!fromId) return;
    setSource(null);
    setPicked(new Set());
    api.get(`/api/stores/${fromId}/products`).then(setSource).catch((e) => setError(e.message));
  }, [fromId]);

  const have = (p) => haveNames.has(p.name.toLowerCase());
  const available = (source ?? []).filter((p) => !have(p));
  const toggle = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const r = await api.post('/api/products/import', { from_store: Number(fromId), product_ids: [...picked] });
      onDone({ ...r, from: others.find((s) => String(s.id) === fromId)?.name });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <form className="card card-pad" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600 }}>{t('importProducts.title', { name: current.name })}</h2>
          <p className="muted" style={{ margin: 0, fontSize: 14, maxWidth: 560 }}>
            {t('importProducts.help')}
          </p>
        </div>
        <label className="field">{t('common.copyFrom')}
          <select className="input" value={fromId} onChange={(e) => setFromId(e.target.value)}>
            {others.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      </div>
      {error && <div className="error">{error}</div>}
      {source && source.length === 0 && <p className="muted" style={{ margin: 0 }}>{t('importProducts.sourceEmpty')}</p>}
      <div className="import-list product-list">
        {(source ?? []).map((p) => (
          <label key={p.id} className={`import-row tall ${have(p) ? 'have' : ''}`}>
            <input className="chk" type="checkbox" disabled={have(p)} checked={picked.has(p.id)} onChange={() => toggle(p.id)} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontWeight: 600 }}>
                {p.name}
                {have(p) && <span className="badge ok">{t('common.alreadyHere')}</span>}
              </span>
              <span className="muted" style={{ display: 'block', fontSize: 13, lineHeight: 1.4 }}>
                {p.recipe.map((r) => `${r.name} ${r.display}`).join(' · ')}
              </span>
            </span>
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn primary" type="submit" disabled={saving || picked.size === 0}>
          {saving ? t('importProducts.copying') : picked.size ? t('importProducts.copyButton', { n: picked.size }) : t('importProducts.copyButtonNone')}
        </button>
        <button className="btn" type="button" onClick={onCancel} disabled={saving}>{t('common.cancel')}</button>
      </div>
      {available.length === 0 && source && source.length > 0 && <p className="muted" style={{ margin: 0, fontSize: 13 }}>{t('importProducts.haveAll')}</p>}
    </form>
  );
}
