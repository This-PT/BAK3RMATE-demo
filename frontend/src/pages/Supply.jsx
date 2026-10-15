import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { baht, bahtShort } from '../format.js';
import KpiCard from '../components/KpiCard.jsx';

const GRID = { gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr) minmax(0,1.2fr) minmax(0,1.2fr) minmax(0,1fr) minmax(0,1fr)' };

export default function Supply() {
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ id: '', qty: '', unit_cost: '' });
  const [error, setError] = useState('');

  const load = () => api.get('/api/supplies').then(setData).catch((e) => setError(e.message));
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

  if (!data) return error ? <div className="error">{error}</div> : null;
  const { supplies, kpis } = data;
  const shown = supplies.filter((s) => `${s.name} ${s.name_th || ''}`.toLowerCase().includes(q.toLowerCase()));
  const total = supplies.reduce((sum, s) => sum + s.stock_value, 0);
  const picked = supplies.find((s) => String(s.id) === form.id);

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Supply</h1>
          <p>Everything you have in stock. Unit cost is your latest purchase price, and every product that uses an item updates automatically.</p>
        </div>
        <button className="btn primary" onClick={() => setAdding(!adding)}>+ Add purchase</button>
      </header>
      {error && <div className="error">{error}</div>}

      <div className="kpis">
        <KpiCard label="Items in stock" value={kpis.items} />
        <KpiCard label="Stock value" value={bahtShort(kpis.stock_value)} />
        <KpiCard label="Running low" value={kpis.low_count} tone="warn" />
        <KpiCard label="Prices up this week" value={kpis.price_ups} tone="bad" />
      </div>

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
          <label className="field">Quantity bought {picked ? `(${picked.unit})` : ''}
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
        <div className="scroll-x">
          <div style={{ minWidth: 760 }}>
            <div className="thead" style={GRID}>
              <span>Item</span><span className="r">In stock</span><span className="r">Unit cost</span>
              <span>vs last purchase</span><span className="r">Stock value</span><span>Status</span>
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
              </div>
            ))}
            <div className="trow" style={{ ...GRID, borderBottom: 'none' }}>
              <span style={{ fontWeight: 600 }}>Total</span><span /><span /><span />
              <span className="mono r" style={{ fontWeight: 600 }}>{baht(total)}</span><span />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
