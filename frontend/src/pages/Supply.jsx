import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { baht, bahtShort } from '../format.js';
import KpiCard from '../components/KpiCard.jsx';
import { useStores } from '../store.jsx';
import TrashList from '../components/TrashList.jsx';
import { shortDate } from '../dates.js';

const GRID = { gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr) minmax(0,1.2fr) minmax(0,1.2fr) minmax(0,1fr) minmax(0,1fr) 90px' };

export default function Supply() {
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
    if (!window.confirm(`Delete "${s.name}"?\n\nIt moves to "Deleted supplies" below, so you can restore it later.`)) return;
    setError('');
    try {
      await api.del(`/api/supplies/${s.id}`);
      setNotice(`"${s.name}" was moved to Deleted supplies. You can restore it below.`);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const restoreSupply = async (it) => {
    setError('');
    try {
      await api.post(`/api/supplies/${it.id}/restore`);
      setNotice(`"${it.title}" is back.`);
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
      setNotice(`Copied ${r.added.length} ${r.added.length === 1 ? 'ingredient' : 'ingredients'} from ${from}: ${r.added.map((a) => a.name).join(', ')}.${r.skipped.length ? ` Skipped ${r.skipped.join(', ')} (already here).` : ''} Stock starts at 0.`);
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
          <h1>Supply</h1>
          <p>Everything you have in stock. Unit cost is your latest purchase price, and every product that uses an item updates automatically.</p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {others.length > 0 && <button className="btn" onClick={openImport}>{importing ? 'Cancel import' : 'Import from another store'}</button>}
          <button className="btn" onClick={() => setCreating(!creating)}>+ New supply</button>
          <button className="btn primary" onClick={() => setAdding(!adding)} disabled={supplies.length === 0}>+ Add purchase</button>
        </div>
      </header>
      {error && <div className="error">{error}</div>}
      {notice && <div className="notice" role="status">{notice}</div>}

      <div className="kpis">
        <KpiCard label="Items in stock" value={kpis.items} />
        <KpiCard label="Stock value" value={bahtShort(kpis.stock_value)} />
        <KpiCard label="Running low" value={kpis.low_count} tone="warn" />
        <KpiCard label="Prices up this week" value={kpis.price_ups} tone="bad" />
      </div>

      {importing && (
        <form className="card card-pad" onSubmit={doImport} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div>
              <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600 }}>Copy ingredients into {current.name}</h2>
              <p className="muted" style={{ margin: 0, fontSize: 14 }}>Tick the ones you want. You get the same name, unit and price, with no stock. Each copy is yours to change.</p>
            </div>
            <label className="field">Copy from
              <select className="input" value={fromId} onChange={(e) => chooseSource(e.target.value)}>
                {others.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          </div>
          {source.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>That store has no ingredients yet.</p>
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
                Select all that you don't have yet ({importable.length})
              </label>
              <div className="import-list">
                {source.map((s) => {
                  const have = haveNames.has(s.name.toLowerCase());
                  return (
                    <label key={s.id} className={`import-row ${have ? 'have' : ''}`}>
                      <input className="chk" type="checkbox" disabled={have} checked={picked.has(s.id)} onChange={() => togglePick(s.id)} />
                      <span style={{ flex: 1, fontWeight: 500 }}>{s.name}</span>
                      <span className="mono muted" style={{ fontSize: 14 }}>{bahtShort(s.unit_cost)} / {s.unit}</span>
                      {have && <span className="badge ok">Already here</span>}
                    </label>
                  );
                })}
              </div>
            </>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn primary" type="submit" disabled={picked.size === 0}>Copy {picked.size || ''} {picked.size === 1 ? 'ingredient' : 'ingredients'}</button>
            <button className="btn" type="button" onClick={() => setImporting(false)}>Cancel</button>
          </div>
        </form>
      )}

      {creating && (
        <form className="card card-pad" onSubmit={createSupply} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <label className="field" style={{ flex: '1 1 220px' }}>Name
            <input className="input" required maxLength={60} value={fresh.name} onChange={(e) => setFresh({ ...fresh, name: e.target.value })} placeholder="e.g. Rice flour" />
          </label>
          <label className="field">Counted in
            <select className="input" value={fresh.unit} onChange={(e) => setFresh({ ...fresh, unit: e.target.value })}>
              <option value="kg">kilograms (kg)</option>
              <option value="pc">pieces (pc)</option>
            </select>
          </label>
          <label className="field">In stock ({fresh.unit})
            <input className="input" style={{ width: 120 }} inputMode="decimal" value={fresh.qty} onChange={(e) => setFresh({ ...fresh, qty: e.target.value })} placeholder="0" />
          </label>
          <label className="field">Price per {fresh.unit} (฿)
            <input className="input" style={{ width: 130 }} required inputMode="decimal" value={fresh.unit_cost} onChange={(e) => setFresh({ ...fresh, unit_cost: e.target.value })} />
          </label>
          <label className="field">Running low at ({fresh.unit})
            <input className="input" style={{ width: 130 }} inputMode="decimal" value={fresh.low_stock_at} onChange={(e) => setFresh({ ...fresh, low_stock_at: e.target.value })} placeholder="0" />
          </label>
          <button className="btn primary" type="submit">Save supply</button>
        </form>
      )}

      {adding && (
        <form className="card card-pad" onSubmit={submit} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <label className="field" style={{ flex: '1 1 200px' }}>Item
            <select className="input" required value={form.id} onChange={(e) => {
              const s = supplies.find((x) => String(x.id) === e.target.value);
              setForm({ ...form, id: e.target.value, unit_cost: s ? String(s.unit_cost) : '' });
            }}>
              <option value="" disabled>Choose…</option>
              {supplies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="field">Quantity bought {boughtItem ? `(${boughtItem.unit})` : ''}
            <input className="input" required inputMode="decimal" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
          </label>
          <label className="field">Unit cost (฿)
            <input className="input" required inputMode="decimal" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} />
          </label>
          <button className="btn primary" type="submit">Save purchase</button>
        </form>
      )}

      <section className="card" aria-label="Stock list">
        <div className="card-pad" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>All supplies</h2>
          <label className="search" style={{ display: 'flex' }}>
            <span className="sr-only">Search supplies</span>
            <input className="input" style={{ flex: 1 }} type="search" placeholder="Search supplies…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
        {supplies.length === 0 && (
          <p className="muted" style={{ margin: 0, padding: '4px 24px 20px', fontSize: 15 }}>No supplies in this store yet. Use "+ New supply" to add your first ingredient or material.</p>
        )}
        <div className="scroll-x">
          <div style={{ minWidth: 840 }}>
            <div className="thead" style={GRID}>
              <span>Item</span><span className="r">In stock</span><span className="r">Unit cost</span>
              <span>vs last purchase</span><span className="r">Stock value</span><span>Status</span><span />
            </div>
            {shown.map((s) => (
              <div className="trow" style={GRID} key={s.id}>
                <span style={{ fontWeight: 500 }}>{s.name}</span>
                <span className="mono r" style={{ fontSize: 14 }}>{s.qty} {s.unit === 'pc' ? 'pcs' : s.unit}</span>
                <span className="mono r" style={{ fontSize: 14 }}>{bahtShort(s.unit_cost)} / {s.unit}</span>
                <span>
                  {Math.abs(s.change_pct) >= 0.5
                    ? <span className={`badge ${s.change_pct > 0 ? 'up' : 'ok'}`}>{s.change_pct > 0 ? '+' : '−'}{Math.abs(s.change_pct).toFixed(0)}%</span>
                    : <span className="muted" style={{ fontSize: 14 }}>No change</span>}
                </span>
                <span className="mono r" style={{ fontSize: 14 }}>{baht(s.stock_value)}</span>
                <span><span className={`badge ${s.low ? 'low' : 'ok'}`}>{s.low ? 'Running low' : 'In stock'}</span></span>
                <span className="r"><button className="btn ghost" style={{ color: 'var(--bad)' }} onClick={() => removeSupply(s)} aria-label={`Delete ${s.name}`}>Delete</button></span>
              </div>
            ))}
            <div className="trow" style={{ ...GRID, borderBottom: 'none' }}>
              <span style={{ fontWeight: 600 }}>Total</span><span /><span /><span />
              <span className="mono r" style={{ fontWeight: 600 }}>{baht(total)}</span><span /><span />
            </div>
          </div>
        </div>
      </section>
      <TrashList
        title="Deleted supplies"
        items={deleted.map((d) => ({ id: d.id, title: d.name, detail: `${bahtShort(d.unit_cost)} / ${d.unit} · deleted ${shortDate(d.deleted_at)}` }))}
        onRestore={restoreSupply}
      />
    </>
  );
}
