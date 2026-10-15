import { useEffect, useMemo, useState } from 'react';
import { api, downloadFile } from '../api.js';
import { RANGES, daysAgo, dayLabel, ymd, salesRangeQuery } from '../dates.js';
import { baht, pct } from '../format.js';
import KpiCard from '../components/KpiCard.jsx';

const GRID = { gridTemplateColumns: 'minmax(0,2fr) minmax(0,1.2fr) 70px minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) 80px' };
const tone = (n) => (n < 0 ? 'bad' : 'good');

export default function SoldLog() {
  const [range, setRange] = useState('7');
  const [data, setData] = useState(null);
  const [listings, setListings] = useState([]);
  const [form, setForm] = useState({ date: ymd(new Date()), shopId: '', listingId: '', qty: '1', price: '' });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    const from = RANGES.find((r) => r.key === range).from();
    const q = from ? `?from=${from}&to=${daysAgo(0)}` : '';
    return api.get(`/api/sales${q}`).then(setData).catch((e) => setError(e.message));
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [range]);

  useEffect(() => {
    api.get('/api/dashboard').then((d) => {
      setListings(d.listings);
      const first = d.listings[0];
      if (first) setForm((f) => ({ ...f, shopId: String(first.shop_id), listingId: String(first.id), price: String(first.price) }));
    }).catch((e) => setError(e.message));
  }, []);

  const shops = useMemo(() => [...new Map(listings.map((l) => [l.shop_id, l.shop_name])).entries()], [listings]);
  const inShop = listings.filter((l) => String(l.shop_id) === form.shopId);

  const pickShop = (shopId) => {
    const first = listings.find((l) => String(l.shop_id) === shopId);
    setForm((f) => ({ ...f, shopId, listingId: first ? String(first.id) : '', price: first ? String(first.price) : '' }));
  };
  const pickProduct = (listingId) => {
    const l = listings.find((x) => String(x.id) === listingId);
    setForm((f) => ({ ...f, listingId, price: l ? String(l.price) : f.price }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setSaving(true);
    try {
      const sale = await api.post('/api/sales', {
        sold_on: form.date,
        listing_id: Number(form.listingId),
        qty: Number(form.qty),
        unit_price: Number(form.price),
      });
      setNotice(`Logged ${sale.qty} × ${sale.product_name} (${sale.shop_name}) on ${dayLabel(sale.sold_on)}: profit ${baht(sale.profit)}.`);
      setForm((f) => ({ ...f, qty: '1' }));
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const [exporting, setExporting] = useState(false);
  const exportXlsx = async () => {
    setExporting(true);
    setError('');
    try {
      const name = await downloadFile(`/api/export.xlsx?${salesRangeQuery(range)}`);
      setNotice(`${name} is ready. Part 1: today's prices per shop. Part 2: the sold log and a daily summary for "${RANGES.find((r) => r.key === range).label}".`);
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  };

  const remove = async (s) => {
    if (!window.confirm(`Delete ${s.qty} × ${s.product_name} (${s.shop_name}) from ${dayLabel(s.sold_on)}?`)) return;
    setError('');
    try {
      await api.del(`/api/sales/${s.id}`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const t = data?.totals;

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Sold Log</h1>
          <p>Record what you sell each day. Each sale keeps the true cost from the day you logged it, so later price changes never rewrite your history.</p>
        </div>
        <button className="btn" onClick={exportXlsx} disabled={exporting}>{exporting ? 'Preparing…' : 'Export to Excel'}</button>
      </header>
      {error && <div className="error">{error}</div>}
      {notice && <div className="notice" role="status">{notice}</div>}

      <form className="card card-pad sale-form" onSubmit={submit} aria-label="Log a sale">
        <label className="field">Date
          <input className="input" type="date" required value={form.date} max={ymd(new Date())} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </label>
        <label className="field">Shop
          <select className="input" value={form.shopId} onChange={(e) => pickShop(e.target.value)} required>
            {shops.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <label className="field" style={{ flex: '1 1 200px' }}>Product
          <select className="input" value={form.listingId} onChange={(e) => pickProduct(e.target.value)} required>
            {inShop.length === 0 && <option value="">No products in this shop</option>}
            {inShop.map((l) => <option key={l.id} value={l.id}>{l.product_name}</option>)}
          </select>
        </label>
        <label className="field">Quantity
          <input className="input" style={{ width: 90 }} type="number" min="1" max="100000" step="1" required value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
        </label>
        <label className="field">Selling price each (฿)
          <input className="input" style={{ width: 130 }} inputMode="decimal" required value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
        </label>
        <button className="btn primary" type="submit" disabled={saving || !form.listingId}>{saving ? 'Saving…' : '+ Log sale'}</button>
      </form>

      <div className="pills" role="group" aria-label="Period">
        {RANGES.map((r) => (
          <button key={r.key} className="pill" aria-pressed={range === r.key} onClick={() => setRange(r.key)}>{r.label}</button>
        ))}
      </div>

      {t && (
        <div className="kpis">
          <KpiCard label="Units sold" value={t.units} />
          <KpiCard label="Revenue" value={baht(t.revenue)} />
          <KpiCard label="True cost" value={baht(t.cost)} sub="ingredients, fees, ads and wear" />
          <KpiCard label="Profit" value={baht(t.profit)} tone={tone(t.profit)} sub={t.revenue > 0 ? `${pct(t.margin)} margin` : undefined} />
        </div>
      )}

      <section className="card" aria-label="Sales by day">
        {data && data.days.length === 0 && (
          <p className="muted" style={{ margin: 0, padding: '28px 24px', fontSize: 15 }}>
            Nothing logged for this period yet. Use "+ Log sale" above after you sell something.
          </p>
        )}
        <div className="scroll-x">
          <div style={{ minWidth: 820 }}>
            {data?.days.map((day) => (
              <div key={day.date}>
                <div className="day-head">
                  <h2>{dayLabel(day.date)}</h2>
                  <span className="muted">{day.units} sold · {baht(day.revenue)} revenue · <strong className={tone(day.profit)}>{baht(day.profit)} profit</strong></span>
                </div>
                <div className="thead" style={GRID}>
                  <span>Product</span><span>Shop</span><span className="r">Qty</span>
                  <span className="r">Price each</span><span className="r">Revenue</span><span className="r">Profit</span><span />
                </div>
                {day.sales.map((s) => (
                  <div className="trow" style={GRID} key={s.id}>
                    <span style={{ fontWeight: 500 }}>{s.product_name}</span>
                    <span className="muted">{s.shop_name}</span>
                    <span className="mono r">{s.qty}</span>
                    <span className="mono r">{baht(s.unit_price)}</span>
                    <span className="mono r">{baht(s.revenue)}</span>
                    <span className={`mono r ${tone(s.profit)}`}>{baht(s.profit)}</span>
                    <span className="r"><button className="btn ghost" style={{ color: 'var(--bad)' }} onClick={() => remove(s)} aria-label={`Delete ${s.product_name} sale`}>Delete</button></span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
