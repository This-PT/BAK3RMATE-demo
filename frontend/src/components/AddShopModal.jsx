import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { baht } from '../format.js';
import { useI18n } from '../i18n.jsx';

const rate = (n) => `${parseFloat(Number(n).toFixed(2))}%`;

// The fee chips shown on each platform card, only for fees that actually apply.
function chips(f, t) {
  const out = [];
  if (f.commission_pct > 0) out.push([t('fee.commission'), rate(f.commission_pct)]);
  if (f.transaction_pct > 0) out.push([t('chip.payment'), rate(f.transaction_pct)]);
  if (f.extra_pct > 0) out.push([f.extra_cap_per_item ? t('chip.growth') : t('chip.service'), `${rate(f.extra_pct)}${f.extra_cap_per_item ? ` (${t('shops.max', { amount: baht(f.extra_cap_per_item) })})` : ''}`]);
  if (f.shipping_pct > 0) out.push([t('fee.shipping'), rate(f.shipping_pct)]);
  if (f.fixed_fee_per_order > 0) out.push([t('chip.perOrder'), baht(f.fixed_fee_per_order)]);
  return out;
}

export default function AddShopModal({ shops, currentShopId, onClose, onCreated }) {
  const { t } = useI18n();
  // preset text comes from the server in English; use our own translation when we have one
  const label = (p, field) => {
    const v = t(`preset.${p.key}.${field}`);
    return v === `preset.${p.key}.${field}` ? p[field] : v;
  };
  const [presets, setPresets] = useState([]);
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [copyFrom, setCopyFrom] = useState(currentShopId ? String(currentShopId) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef(null);

  useEffect(() => {
    api.get('/api/shop-presets').then((p) => {
      setPresets(p);
      setKey(p[0]?.key ?? '');
      setName(p[0] ? label(p[0], 'name') : '');
    }).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !saving && onClose();
    document.addEventListener('keydown', onKey);
    dialog.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [saving, onClose]);

  const pick = (p) => {
    setKey(p.key);
    if (!nameTouched) setName(label(p, 'name'));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!key || !name.trim()) return;
    setSaving(true);
    setError('');
    try {
      const shop = await api.post('/api/shops', { preset: key, name: name.trim(), copy_from: copyFrom ? Number(copyFrom) : null });
      onCreated(shop);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  const selected = presets.find((p) => p.key === key);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !saving && onClose()}>
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby="add-shop-title" ref={dialog} tabIndex={-1} onSubmit={submit}>
        <div className="modal-head">
          <div>
            <h2 id="add-shop-title">{t('addShop.title')}</h2>
            <p>{t('addShop.help')}</p>
          </div>
          <button type="button" className="btn ghost" onClick={onClose} aria-label={t('common.close')} disabled={saving}>✕</button>
        </div>

        <div className="modal-body">
          {error && <div className="error">{error}</div>}
          <fieldset className="preset-list">
            <legend className="sr-only">{t('addShop.platform')}</legend>
            {presets.map((p) => (
              <label key={p.key} className={`preset ${p.key === key ? 'on' : ''}`}>
                <input type="radio" name="preset" checked={p.key === key} onChange={() => pick(p)} />
                <span className="preset-main">
                  <span className="preset-top">
                    <strong>{label(p, 'name')}</strong>
                    {p.key !== 'custom' && (
                      <span className="preset-total mono">{rate(p.total_pct)}{p.fees.fixed_fee_per_order > 0 ? ` + ${baht(p.fees.fixed_fee_per_order)}` : ''}</span>
                    )}
                  </span>
                  <span className="muted preset-sum">{label(p, 'summary')}</span>
                  <span className="chips">
                    {chips(p.fees, t).map(([k, v]) => <span className="chip" key={k}><span className="muted">{k}</span> <b className="mono">{v}</b></span>)}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          {selected?.note && <p className="muted" style={{ margin: 0, fontSize: 13 }}>{label(selected, 'note')}</p>}

          <div className="modal-fields">
            <label className="field" style={{ flex: '1 1 240px' }}>{t('shops.shopName')}
              <input className="input" value={name} maxLength={60} required onChange={(e) => { setName(e.target.value); setNameTouched(true); }} />
            </label>
            <label className="field" style={{ flex: '1 1 240px' }}>{t('addShop.startWith')}
              <select className="input" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
                <option value="">{t('addShop.startEmpty')}</option>
                {shops.map((s) => <option key={s.id} value={s.id}>{t('addShop.copyFrom', { name: s.name })}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose} disabled={saving}>{t('common.cancel')}</button>
          <button type="submit" className="btn primary" disabled={saving || !key || !name.trim()}>{saving ? t('addShop.adding') : t('addShop.add')}</button>
        </div>
      </form>
    </div>
  );
}
