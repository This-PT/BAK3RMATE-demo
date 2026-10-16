import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { baht, bahtShort, unitName, unitCount } from '../format.js';
import { useI18n } from '../i18n.jsx';
import KpiCard from '../components/KpiCard.jsx';
import { useStores } from '../store.jsx';
import TrashList from '../components/TrashList.jsx';
import { shortDate } from '../dates.js';

const GRID = { gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr) minmax(0,1.2fr) minmax(0,1.2fr) minmax(0,1fr) minmax(0,1fr) 90px' };

export default function Supply() {
  const { t } = useI18n();
  const { stores, current } = useStores();
  const others = stores.filter((s) => s.id !== current.id);
  const [importing, setImporting] = useState(false);
  const [fromId, setFromId] = useState('');
  const [source, setSource] = useState([]);
  const [picked, setPicked] = useState(new Set());
  const [notice, setNotice] = useState('');
  const [deleted, setDeleted] = useState([]);
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ id: '', qty: '', unit_cost: '' });
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [fresh, setFresh] = useState({ name: '', unit: 'kg', qty: '', unit_cost: '', low_stock_at: '' });

  const load = () => {
    api.get('/api/supplies/deleted').then(setDeleted).catch(() => {});
    return api.get('/api/supplies').then(setData).catch((e) => setError(e.message));
  };
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post(`/api/supplies/${form.id}/purchase`, { qty: Number(form.qty), unit_cost: Number(form.unit_cost), source: 'manual' });
      setForm({ id: '', qty: '', unit_cost: '' });
      setAdding(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const createSupply = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/api/supplies', {
        name: fresh.name.trim(),
        unit: fresh.unit,
        qty: Number(fresh.qty || 0),
        unit_cost: Number(fresh.unit_cost),
        low_stock_at: Number(fresh.low_stock_at || 0),
      });
      setFresh({ name: '', unit: 'kg', qty: '', unit_cost: '', low_stock_at: '' });
      setCreating(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const removeSupply = async (s) => {
    if (!window.confirm(t('supply.confirmDelete', { name: s.name }))) return;
    setError('');
    try {
      await api.del(`/api/supplies/${s.id}`);
      setNotice(t('supply.movedToDeleted', { name: s.name }));
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const restoreSupply = async (it) => {
    setError('');
    try {
      await api.post(`/api/supplies/${it.id}/restore`);
      setNotice(t('supply.restored', { name: it.title }));
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const openImport = async () => {
    if (importing) return setImporting(false);
    setImporting(true);
    setNotice('');
    await chooseSource(fromId || String(others[0]?.id ?? ''));
  };

  const chooseSource = async (id) => {
    setFromId(id);
    setPicked(new Set());
    if (!id) return setSource([]);
    try {
      setSource(await api.get(`/api/stores/${id}/supplies`));
    } catch (err) {
      setError(err.message);
    }
  };

  const haveNames = new Set((data?.supplies ?? []).map((s) => s.name.toLowerCase()));
  const importable = source.filter((s) => !haveNames.has(s.name.toLowerCase()));

  const togglePick = (id) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const doImport = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const r = await api.post('/api/supplies/import', { from_store: Number(fromId), supply_ids: [...picked] });
      const from = others.find((s) => String(s.id) === fromId)?.name;
      setNotice(
        [
          t('supply.importDone', { n: r.added.length, from, names: r.added.map((a) => a.name).join(', ') }),
          r.skipped.length ? t('common.skipped', { names: r.skipped.join(', ') }) : '',
          t('supply.stockStarts'),
        ].filter(Boolean).join(' '),
      );
      setImporting(false);
      setPicked(new Set());
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  if (!data) return error ? <div className="error">{error}</div> : null;
  const { supplies, kpis } = data;
  const shown = supplies.filter((s) => `${s.name} ${s.name_th || ''}`.toLowerCase().includes(q.toLowerCase()));
  const total = supplies.reduce((sum, s) => sum + s.stock_value, 0);
  const boughtItem = supplies.find((s) => String(s.id) === form.id);

  return (
    <>
      <header className="page-head">
        <div>
          <h1>{t('nav.supply')}</h1>
          <p>{t('supply.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {others.length > 0 && <button className="btn" onClick={openImport}>{importing ? t('common.cancelImport') : t('common.importFromStore')}</button>}
          <button className="btn" onClick={() => setCreating(!creating)}>{t('supply.newPlus')}</button>
          <button className="btn primary" onClick={() => setAdding(!adding)} disabled={supplies.length === 0}>{t('supply.addPurchasePlus')}</button>
        </div>
      </header>
      {error && <div className="error">{error}</div>}
      {notice && <div className="notice" role="status">{notice}</div>}

      <div className="kpis">
        <KpiCard label={t('supply.kpiItems')} value={kpis.items} />
        <KpiCard label={t('supply.kpiValue')} value={bahtShort(kpis.stock_value)} />
        <KpiCard label={t('supply.kpiLow')} value={kpis.low_count} tone="warn" />
        <KpiCard label={t('supply.kpiPricesUp')} value={kpis.price_ups} tone="bad" />
      </div>

      {importing && (
        <form className="card card-pad" onSubmit={doImport} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div>
              <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600 }}>{t('supply.copyInto', { name: current.name })}</h2>
              <p className="muted" style={{ margin: 0, fontSize: 14 }}>{t('supply.copyHelp')}</p>
            </div>
            <label className="field">{t('common.copyFrom')}
              <select className="input" value={fromId} onChange={(e) => chooseSource(e.target.value)}>
                {others.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          </div>
          {source.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>{t('supply.sourceEmpty')}</p>
          ) : (
            <>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600, fontSize: 14 }}>
                <input
                  className="chk"
                  type="checkbox"
                  checked={importable.length > 0 && picked.size === importable.length}
                  disabled={importable.length === 0}
                  onChange={() => setPicked(picked.size === importable.length ? new Set() : new Set(importable.map((s) => s.id)))}
                />
                {t('supply.selectAll', { n: importable.length })}
              </label>
              <div className="import-list">
                {source.map((s) => {
                  const have = haveNames.has(s.name.toLowerCase());
                  return (
                    <label key={s.id} className={`import-row ${have ? 'have' : ''}`}>
                      <input className="chk" type="checkbox" disabled={have} checked={picked.has(s.id)} onChange={() => togglePick(s.id)} />
                      <span style={{ flex: 1, fontWeight: 500 }}>{s.name}</span>
                      <span className="mono muted" style={{ fontSize: 14 }}>{bahtShort(s.unit_cost)} / {unitName(s.unit)}</span>
                      {have && <span className="badge ok">{t('common.alreadyHere')}</span>}
                    </label>
                  );
                })}
              </div>
            </>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn primary" type="submit" disabled={picked.size === 0}>{picked.size ? t('supply.copyButton', { n: picked.size }) : t('supply.copyButtonNone')}</button>
            <button className="btn" type="button" onClick={() => setImporting(false)}>{t('common.cancel')}</button>
          </div>
        </form>
      )}

      {creating && (
        <form className="card card-pad" onSubmit={createSupply} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <label className="field" style={{ flex: '1 1 220px' }}>{t('common.name')}
            <input className="input" required maxLength={60} value={fresh.name} onChange={(e) => setFresh({ ...fresh, name: e.target.value })} placeholder={t('supply.namePlaceholder')} />
          </label>
          <label className="field">{t('supply.countedIn')}
            <select className="input" value={fresh.unit} onChange={(e) => setFresh({ ...fresh, unit: e.target.value })}>
              <option value="kg">{t('supply.unitKg')}</option>
              <option value="pc">{t('supply.unitPc')}</option>
            </select>
          </label>
          <label className="field">{t('supply.inStockUnit', { unit: unitName(fresh.unit) })}
            <input className="input" style={{ width: 120 }} inputMode="decimal" value={fresh.qty} onChange={(e) => setFresh({ ...fresh, qty: e.target.value })} placeholder="0" />
          </label>
          <label className="field">{t('supply.pricePerUnit', { unit: unitName(fresh.unit) })}
            <input className="input" style={{ width: 130 }} required inputMode="decimal" value={fresh.unit_cost} onChange={(e) => setFresh({ ...fresh, unit_cost: e.target.value })} />
          </label>
          <label className="field">{t('supply.lowAtUnit', { unit: unitName(fresh.unit) })}
            <input className="input" style={{ width: 130 }} inputMode="decimal" value={fresh.low_stock_at} onChange={(e) => setFresh({ ...fresh, low_stock_at: e.target.value })} placeholder="0" />
          </label>
          <button className="btn primary" type="submit">{t('supply.saveSupply')}</button>
        </form>
      )}

      {adding && (
        <form className="card card-pad" onSubmit={submit} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <label className="field" style={{ flex: '1 1 200px' }}>{t('supply.item')}
            <select className="input" required value={form.id} onChange={(e) => {
              const s = supplies.find((x) => String(x.id) === e.target.value);
              setForm({ ...form, id: e.target.value, unit_cost: s ? String(s.unit_cost) : '' });
            }}>
              <option value="" disabled>{t('common.choose')}</option>
              {supplies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="field">{t('supply.quantityBought')} {boughtItem ? `(${unitName(boughtItem.unit)})` : ''}
            <input className="input" required inputMode="decimal" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
          </label>
          <label className="field">{t('supply.unitCostBaht')}
            <input className="input" required inputMode="decimal" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} />
          </label>
          <button className="btn primary" type="submit">{t('supply.savePurchase')}</button>
        </form>
      )}

      <section className="card" aria-label={t('supply.stockList')}>
        <div className="card-pad" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{t('supply.all')}</h2>
          <label className="search" style={{ display: 'flex' }}>
            <span className="sr-only">{t('supply.search')}</span>
            <input className="input" style={{ flex: 1 }} type="search" placeholder={t('supply.searchPh')} value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
        {supplies.length === 0 && (
          <p className="muted" style={{ margin: 0, padding: '4px 24px 20px', fontSize: 15 }}>{t('supply.empty')}</p>
        )}
        <div className="scroll-x">
          <div style={{ minWidth: 840 }}>
            <div className="thead" style={GRID}>
              <span>{t('supply.colItem')}</span><span className="r">{t('supply.colInStock')}</span><span className="r">{t('supply.colUnitCost')}</span>
              <span>{t('supply.colVsLast')}</span><span className="r">{t('supply.colValue')}</span><span>{t('supply.colStatus')}</span><span />
            </div>
            {shown.map((s) => (
              <div className="trow" style={GRID} key={s.id}>
                <span style={{ fontWeight: 500 }}>{s.name}</span>
                <span className="mono r" style={{ fontSize: 14 }}>{s.qty} {unitCount(s.unit)}</span>
                <span className="mono r" style={{ fontSize: 14 }}>{bahtShort(s.unit_cost)} / {unitName(s.unit)}</span>
                <span>
                  {Math.abs(s.change_pct) >= 0.5
                    ? <span className={`badge ${s.change_pct > 0 ? 'up' : 'ok'}`}>{s.change_pct > 0 ? '+' : '−'}{Math.abs(s.change_pct).toFixed(0)}%</span>
                    : <span className="muted" style={{ fontSize: 14 }}>{t('supply.noChange')}</span>}
                </span>
                <span className="mono r" style={{ fontSize: 14 }}>{baht(s.stock_value)}</span>
                <span><span className={`badge ${s.low ? 'low' : 'ok'}`}>{s.low ? t('supply.low') : t('supply.ok')}</span></span>
                <span className="r"><button className="btn ghost" style={{ color: 'var(--bad)' }} onClick={() => removeSupply(s)} aria-label={t('common.deleteNamed', { name: s.name })}>{t('common.delete')}</button></span>
              </div>
            ))}
            <div className="trow" style={{ ...GRID, borderBottom: 'none' }}>
              <span style={{ fontWeight: 600 }}>{t('common.total')}</span><span /><span /><span />
              <span className="mono r" style={{ fontWeight: 600 }}>{baht(total)}</span><span /><span />
            </div>
          </div>
        </div>
      </section>
      <TrashList
        title={t('supply.deletedTitle')}
        items={deleted.map((d) => ({ id: d.id, title: d.name, detail: t('supply.deletedDetail', { price: bahtShort(d.unit_cost), unit: unitName(d.unit), date: shortDate(d.deleted_at) }) }))}
        onRestore={restoreSupply}
      />
    </>
  );
}
