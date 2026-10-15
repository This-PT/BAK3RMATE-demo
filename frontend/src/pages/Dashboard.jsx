import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, downloadFile } from '../api.js';
import { RANGES, salesRangeQuery } from '../dates.js';
import { baht, bahtShort, pct } from '../format.js';
import Badge from '../components/Badge.jsx';
import KpiCard from '../components/KpiCard.jsx';

const GRID = { gridTemplateColumns: '28px minmax(0,2fr) minmax(0,1.2fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,0.8fr) minmax(0,1.2fr)' };
const tone = (s) => (s === 'losing' ? 'bad' : s === 'thin' ? 'warn' : 'good');

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [exported, setExported] = useState('');
  const [period, setPeriod] = useState('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/api/dashboard').then((d) => {
      setData(d);
      setSelected(new Set(d.listings.map((l) => l.id)));
    }).catch((e) => setError(e.message));
  }, []);

  if (!data) return error ? <div className="error">{error}</div> : null;
  const { kpis, listings } = data;
  const all = selected.size === listings.length;
  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const exportXlsx = async () => {
    setBusy(true);
    setError('');
    setExported('');
    try {
      const q = [`listing_ids=${[...selected].join(',')}`, salesRangeQuery(period)].filter(Boolean).join('&');
      setExported(await downloadFile(`/api/export.xlsx?${q}`));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>Every product across your shops, with its true cost. Export it for your bookkeeping.</p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <label className="field">Sold log in the file
            <select className="input" value={period} onChange={(e) => setPeriod(e.target.value)}>
              {RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </label>
          <button className="btn primary" onClick={exportXlsx} disabled={busy || selected.size === 0}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 4v11" /><path d="M7 10l5 5 5-5" /><path d="M4 19h16" />
          </svg>
          {busy ? 'Preparing…' : 'Export to Excel'}
        </button>
        </div>
      </header>
      {error && <div className="error">{error}</div>}
      {exported && <div className="notice" role="status">{exported} is ready. Part 1: today's price and cost breakdown, one sheet per shop. Part 2: the sold log and a daily summary.</div>}

      <div className="kpis">
        <KpiCard label="Products tracked" value={kpis.products_tracked} sub={`in ${kpis.shops} shops`} />
        <KpiCard label="Losing money" value={kpis.losing} tone="bad" sub={kpis.losing_names.join(', ') || 'None'} />
        <KpiCard label="Thin margin (under 5%)" value={kpis.thin} tone="warn" sub={kpis.thin_names.join(', ') || 'None'} />
        <KpiCard label="Stock value" value={bahtShort(kpis.stock_value)} sub={<Link to="/supply">View Supply</Link>} />
      </div>

      <section className="card" aria-label="All products">
        <div className="card-pad" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>All products</h2>
          <span className="muted" style={{ fontSize: 14 }}>{selected.size} of {listings.length} selected for export</span>
        </div>
        {listings.length === 0 && (
          <p className="muted" style={{ margin: 0, padding: '4px 24px 20px', fontSize: 15 }}>No products are sold in any shop yet. Add shops and products first, then they show up here.</p>
        )}
        <div className="scroll-x">
          <div style={{ minWidth: 880 }}>
            <div className="thead" style={GRID}>
              <span><input className="chk" type="checkbox" checked={all} aria-label="Select all products"
                onChange={() => setSelected(all ? new Set() : new Set(listings.map((l) => l.id)))} /></span>
              <span>Product</span><span>Shop</span><span className="r">Price</span><span className="r">True cost</span>
              <span className="r">Profit / order</span><span className="r">Margin</span><span>Status</span>
            </div>
            {listings.map((l) => (
              <div className="trow" style={GRID} key={l.id}>
                <span><input className="chk" type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} aria-label={`Select ${l.product_name} on ${l.shop_name}`} /></span>
                <span style={{ fontWeight: 500 }}>{l.product_name}</span>
                <span className="muted">{l.shop_name}</span>
                <span className="mono r">{baht(l.price)}</span>
                <span className="mono r">{baht(l.trueCost)}</span>
                <span className={`mono r ${tone(l.status)}`}>{baht(l.profit)}</span>
                <span className={`mono r ${tone(l.status)}`}>{pct(l.margin)}</span>
                <span><Badge status={l.status} /></span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
