import { useEffect, useMemo, useState } from 'react';
import { api, downloadFile } from '../api.js';
import { RANGES, daysAgo, dayLabel, ymd, salesRangeQuery } from '../dates.js';
import { baht, pct } from '../format.js';
import KpiCard from '../components/KpiCard.jsx';
import TrashList from '../components/TrashList.jsx';
import { useI18n } from '../i18n.jsx';
import { getLang } from '../i18n-core.js';

const GRID = { gridTemplateColumns: 'minmax(0,2fr) minmax(0,1.2fr) 70px minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) 80px' };
const tone = (n) => (n < 0 ? 'bad' : 'good');

export default function SoldLog() {
  const { t } = useI18n();
  const [range, setRange] = useState('7');
  const [data, setData] = useState(null);
  const [listings, setListings] = useState([]);
  const [loadedListings, setLoadedListings] = useState(false);
  const [form, setForm] = useState({ date: ymd(new Date()), shopId: '', listingId: '', qty: '1', price: '' });
  const [notice, setNotice] = useState('');
  const [deleted, setDeleted] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    const from = RANGES.find((r) => r.key === range).from();
    const q = from ? `?from=${from}&to=${daysAgo(0)}` : '';
    api.get('/api/sales/deleted').then(setDeleted).catch(() => {});
    return api.get(`/api/sales${q}`).then(setData).catch((e) => setError(e.message));
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [range]);

  useEffect(() => {
    api.get('/api/dashboard').then((d) => {
      setLoadedListings(true);
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
      setNotice(t('sold.logged', { qty: sale.qty, product: sale.product_name, shop: sale.shop_name, date: dayLabel(sale.sold_on), profit: baht(sale.profit) }));
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
      const name = await downloadFile(`/api/export.xlsx?${[salesRangeQuery(range), `lang=${getLang()}`].filter(Boolean).join('&')}`);
      setNotice(t('sold.exportReady', { name, period: t(`range.${range}`) }));
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  };

  const restoreSale = async (it) => {
    setError('');
    try {
      await api.post(`/api/sales/${it.id}/restore`);
      setNotice(t('sold.restored', { name: it.title }));
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (s) => {
    if (!window.confirm(t('sold.confirmDelete', { qty: s.qty, product: s.product_name, shop: s.shop_name, date: dayLabel(s.sold_on) }))) return;
    setError('');
    try {
      await api.del(`/api/sales/${s.id}`);
      setNotice(t('sold.movedToDeleted'));
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const totals = data?.totals;

  return (
    <>
      <header className="page-head">
        <div>
          <h1>{t('nav.soldLog')}</h1>
          <p>{t('sold.subtitle')}</p>
        </div>
        <button className="btn" onClick={exportXlsx} disabled={exporting}>{exporting ? t('common.preparing') : t('common.exportExcel')}</button>
      </header>
      {error && <div className="error">{error}</div>}
      {notice && <div className="notice" role="status">{notice}</div>}
      {loadedListings && listings.length === 0 && (
        <div className="card card-pad">{t('sold.noListings')}</div>
      )}

      <form className="card card-pad sale-form" onSubmit={submit} aria-label={t('sold.logASale')}>
        <label className="field">{t('common.date')}
          <input className="input" type="date" required value={form.date} max={ymd(new Date())} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </label>
        <label className="field">{t('common.shop')}
          <select className="input" value={form.shopId} onChange={(e) => pickShop(e.target.value)} required>
            {shops.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <label className="field" style={{ flex: '1 1 200px' }}>{t('common.product')}
          <select className="input" value={form.listingId} onChange={(e) => pickProduct(e.target.value)} required>
            {inShop.length === 0 && <option value="">{t('sold.noProductsInShop')}</option>}
            {inShop.map((l) => <option key={l.id} value={l.id}>{l.product_name}</option>)}
          </select>
        </label>
        <label className="field">{t('sold.quantity')}
          <input className="input" style={{ width: 90 }} type="number" min="1" max="100000" step="1" required value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
        </label>
        <label className="field">{t('sold.priceEachBaht')}
          <input className="input" style={{ width: 130 }} inputMode="decimal" required value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
        </label>
        <button className="btn primary" type="submit" disabled={saving || !form.listingId}>{saving ? t('common.saving') : t('sold.logSalePlus')}</button>
      </form>

      <div className="pills" role="group" aria-label={t('sold.period')}>
        {RANGES.map((r) => (
          <button key={r.key} className="pill" aria-pressed={range === r.key} onClick={() => setRange(r.key)}>{t(`range.${r.key}`)}</button>
        ))}
      </div>

      {totals && (
        <div className="kpis">
          <KpiCard label={t('sold.kpiUnits')} value={totals.units} />
          <KpiCard label={t('sold.kpiRevenue')} value={baht(totals.revenue)} />
          <KpiCard label={t('common.trueCost')} value={baht(totals.cost)} sub={t('sold.costSub')} />
          <KpiCard label={t('common.profit')} value={baht(totals.profit)} tone={tone(totals.profit)} sub={totals.revenue > 0 ? t('sold.marginSub', { pct: pct(totals.margin) }) : undefined} />
        </div>
      )}

      <section className="card" aria-label={t('sold.byDay')}>
        {data && data.days.length === 0 && (
          <p className="muted" style={{ margin: 0, padding: '28px 24px', fontSize: 15 }}>
            {t('sold.nothing')}
          </p>
        )}
        <div className="scroll-x">
          <div style={{ minWidth: 820 }}>
            {data?.days.map((day) => (
              <div key={day.date}>
                <div className="day-head">
                  <h2>{dayLabel(day.date)}</h2>
                  <span className="muted">{t('sold.daySold', { n: day.units })} · {t('sold.dayRevenue', { amount: baht(day.revenue) })} · <strong className={tone(day.profit)}>{t('sold.dayProfit', { amount: baht(day.profit) })}</strong></span>
                </div>
                <div className="thead" style={GRID}>
                  <span>{t('common.product')}</span><span>{t('common.shop')}</span><span className="r">{t('sold.colQty')}</span>
                  <span className="r">{t('sold.colPriceEach')}</span><span className="r">{t('sold.kpiRevenue')}</span><span className="r">{t('common.profit')}</span><span />
                </div>
                {day.sales.map((s) => (
                  <div className="trow" style={GRID} key={s.id}>
                    <span style={{ fontWeight: 500 }}>{s.product_name}</span>
                    <span className="muted">{s.shop_name}</span>
                    <span className="mono r">{s.qty}</span>
                    <span className="mono r">{baht(s.unit_price)}</span>
                    <span className="mono r">{baht(s.revenue)}</span>
                    <span className={`mono r ${tone(s.profit)}`}>{baht(s.profit)}</span>
                    <span className="r"><button className="btn ghost" style={{ color: 'var(--bad)' }} onClick={() => remove(s)} aria-label={t('sold.deleteSale', { name: s.product_name })}>{t('common.delete')}</button></span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>
      <TrashList
        title={t('sold.deletedTitle')}
        items={deleted.map((d) => ({ id: d.id, title: `${d.qty} × ${d.product_name}`, detail: t('sold.deletedDetail', { shop: d.shop_name, date: dayLabel(d.sold_on), profit: baht(d.profit) }) }))}
        onRestore={restoreSale}
      />
    </>
  );
}
