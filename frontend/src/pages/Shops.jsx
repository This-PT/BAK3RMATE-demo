import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { baht, pct } from '../format.js';
import Badge from '../components/Badge.jsx';
import RealityCheck from '../components/RealityCheck.jsx';
import AddShopModal from '../components/AddShopModal.jsx';

const GRID = { gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,0.8fr) minmax(0,1.2fr) 170px' };
// [field, label, unit, hint]
const FEES = [
  ['commission_pct', 'Commission', '%'],
  ['transaction_pct', 'Transaction fee', '%'],
  ['extra_pct', 'Growth / service fee', '%'],
  ['extra_cap_per_item', 'Cap per item', '฿', 'empty = no cap'],
  ['fixed_fee_per_order', 'Platform fee per order', '฿'],
  ['shipping_pct', 'Free-shipping program', '%'],
];
const EMPTY_FEES = { commission_pct: '', transaction_pct: '', extra_pct: '', extra_cap_per_item: '', fixed_fee_per_order: '', shipping_pct: '' };
const feesOf = (s) => Object.fromEntries(FEES.map(([k]) => [k, s[k] === null || s[k] === undefined ? '' : String(s[k])]));
const tone = (s) => (s === 'losing' ? 'bad' : s === 'thin' ? 'warn' : 'good');
const valid = (v) => v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0;

export default function Shops() {
  const [shops, setShops] = useState([]);
  const [shopId, setShopId] = useState(null);
  const [fees, setFees] = useState(EMPTY_FEES);
  const [showAddShop, setShowAddShop] = useState(false);
  const [listings, setListings] = useState([]);
  const [drafts, setDrafts] = useState({}); // `${listingId}:ads|wear` -> typed string
  const [open, setOpen] = useState(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [available, setAvailable] = useState([]);
  const [form, setForm] = useState({ product_id: '', price: '', ads: '0', wear: '0' });
  const nameInput = useRef(null);
  const timers = useRef({});

  const schedule = (key, fn) => {
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(() => fn().catch((e) => setError(e.message)), 250);
  };
  const seq = useRef(0); // ignore listing responses that arrive out of order
  const loadListings = async (id) => {
    const mine = ++seq.current;
    const rows = await api.get(`/api/shops/${id}/listings`);
    if (mine === seq.current) setListings(rows);
  };

  useEffect(() => {
    api.get('/api/shops').then((s) => { setShops(s); setShopId(s[0]?.id ?? null); }).catch((e) => setError(e.message));
  }, []);

  // Load fees, name and listings only when the selected shop changes.
  useEffect(() => {
    const shop = shops.find((s) => s.id === shopId);
    if (!shop) return;
    setFees(feesOf(shop));
    setName(shop.name);
    setOpen(null);
    loadListings(shopId).catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  const patchShopLocal = (id, patch) => setShops((ss) => ss.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const setFee = (field, v) => {
    setFees((f) => ({ ...f, [field]: v }));
    const isCap = field === 'extra_cap_per_item';
    const isPct = FEES.find(([k]) => k === field)[2] === '%';
    if (isCap && v.trim() === '') {
      // empty cap means "no cap"
    } else if (!valid(v) || (isPct && Number(v) > 100)) return;
    const id = shopId;
    schedule(`fee:${field}`, async () => {
      const saved = await api.patch(`/api/shops/${id}`, { [field]: isCap && v.trim() === '' ? null : Number(v) });
      patchShopLocal(id, saved); // keep the tab data in sync so switching tabs shows the saved rates
      await loadListings(id); // engine recalculates every product below
    });
  };

  const rename = (v) => {
    setName(v);
    const trimmed = v.trim();
    if (!trimmed) return;
    const id = shopId;
    patchShopLocal(id, { name: trimmed });
    schedule('name', async () => {
      patchShopLocal(id, await api.patch(`/api/shops/${id}`, { name: trimmed }));
    });
  };

  const openAdd = async () => {
    if (adding) return setAdding(false);
    setError('');
    try {
      const rows = await api.get(`/api/shops/${shopId}/available-products`);
      setAvailable(rows);
      const first = rows[0];
      setForm({ product_id: first ? String(first.id) : '', price: first?.suggested_price ? String(first.suggested_price) : '', ads: '0', wear: '0' });
      setAdding(true);
    } catch (e) {
      setError(e.message);
    }
  };

  const pickProduct = (id) => {
    const p = available.find((x) => String(x.id) === id);
    setForm((f) => ({ ...f, product_id: id, price: p?.suggested_price ? String(p.suggested_price) : f.price }));
  };

  const addProduct = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const l = await api.post(`/api/shops/${shopId}/listings`, {
        product_id: Number(form.product_id),
        price: Number(form.price),
        ads_per_order: Number(form.ads),
        wear_per_order: Number(form.wear),
      });
      setListings((ls) => [...ls, l]);
      patchShopLocal(shopId, { product_count: listings.length + 1 });
      setAdding(false);
      setOpen(l.id);
    } catch (err) {
      setError(err.message);
    }
  };

  const removeProduct = async (l) => {
    if (!window.confirm(`Remove "${l.product_name}" from ${l.shop_name}? The product stays in your other shops.`)) return;
    setError('');
    try {
      await api.del(`/api/listings/${l.id}`);
      setListings((ls) => ls.filter((x) => x.id !== l.id));
      patchShopLocal(shopId, { product_count: listings.length - 1 });
      if (open === l.id) setOpen(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const removeShop = async () => {
    const shop = shops.find((s) => s.id === shopId);
    if (!shop || !window.confirm(`Delete "${shop.name}" and its ${shop.product_count} product listings? This can't be undone.`)) return;
    setError('');
    try {
      await api.del(`/api/shops/${shopId}`);
      const rest = shops.filter((s) => s.id !== shopId);
      setShops(rest);
      setShopId(rest[0]?.id ?? null);
    } catch (e) {
      setError(e.message);
    }
  };

  const shopCreated = (shop) => {
    setShops((ss) => [...ss, shop]);
    setShopId(shop.id);
    setShowAddShop(false);
    setTimeout(() => nameInput.current?.select(), 50);
  };

  const setField = (l, field, v) => {
    setDrafts((d) => ({ ...d, [`${l.id}:${field}`]: v }));
    if (!valid(v) || (field === 'price' && Number(v) <= 0)) return;
    schedule(`${l.id}:${field}`, async () => {
      const key = { price: 'price', ads: 'ads_per_order', wear: 'wear_per_order' }[field];
      const updated = await api.patch(`/api/listings/${l.id}`, { [key]: Number(v) });
      setListings((ls) => ls.map((x) => (x.id === updated.id ? updated : x)));
    });
  };

  const draft = (l, field) => drafts[`${l.id}:${field}`] ?? String({ price: l.price, ads: l.ads, wear: l.wear }[field]);
  const pctTotal = parseFloat(
    FEES.filter(([, , unit]) => unit === '%').reduce((sum, [k]) => sum + (valid(fees[k]) ? Number(fees[k]) : 0), 0).toFixed(2),
  );
  const fixedFee = valid(fees.fixed_fee_per_order) ? Number(fees.fixed_fee_per_order) : 0;

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Shops</h1>
          <p>Each shop charges you differently. See what every product really earns after fees, ads and wear.</p>
        </div>
      </header>
      {error && <div className="error">{error}</div>}

      <div className="pills" role="group" aria-label="Shop">
        {shops.map((s) => (
          <button key={s.id} className="pill" aria-pressed={s.id === shopId} onClick={() => setShopId(s.id)}>
            {s.name} · {s.product_count} products
          </button>
        ))}
        <button className="pill add" onClick={() => setShowAddShop(true)}>+ Add shop</button>
      </div>

      {showAddShop && (
        <AddShopModal shops={shops} currentShopId={shopId} onClose={() => setShowAddShop(false)} onCreated={shopCreated} />
      )}

      <section className="card fees" aria-label="Shop fees">
        <div className="intro">
          <label className="field" style={{ marginBottom: 12 }}>Shop name
            <input
              ref={nameInput}
              className="input"
              style={{ fontSize: 16, fontWeight: 600, maxWidth: 320 }}
              value={name}
              maxLength={60}
              onChange={(e) => rename(e.target.value)}
              onBlur={() => !name.trim() && setName(shops.find((s) => s.id === shopId)?.name ?? '')}
            />
          </label>
          <h2>How this shop charges you</h2>
          <p>Rates come from your seller center and differ by category and campaign. They apply to every product in this shop. Change a rate and every product below recalculates.</p>
        </div>
        <div className="fee-fields">
          {FEES.map(([k, label, unit, hint]) => (
            <label className="field" key={k}>{label}
              <span className="with-unit">
                {unit === '฿' && '฿'}
                <input className="input sm" inputMode="decimal" value={fees[k]} placeholder={hint ? 'none' : undefined} onChange={(e) => setFee(k, e.target.value)} />
                {unit === '%' && '%'}
              </span>
            </label>
          ))}
          <div className="field">Total taken per sale
            <span className="mono" style={{ fontSize: 22, fontWeight: 600, color: 'var(--ink)' }}>
              {pctTotal}%{fixedFee > 0 ? ` + ${baht(fixedFee)}` : ''}
            </span>
          </div>
        </div>
        {shops.length > 1 && (
          <button className="btn danger" style={{ marginLeft: 'auto' }} onClick={removeShop}>Delete shop</button>
        )}
      </section>

      <section className="card" aria-label="Products">
        <div className="card-pad" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Products in {name || 'this shop'}</h2>
          <button className="btn primary" onClick={openAdd}>{adding ? 'Cancel' : '+ Add product'}</button>
        </div>
        {adding && (
          available.length === 0 ? (
            <p className="muted" style={{ margin: '0 24px 16px', fontSize: 14 }}>Every product is already in this shop.</p>
          ) : (
            <form className="form-row" onSubmit={addProduct}>
              <label className="field" style={{ flex: '1 1 220px' }}>Product
                <select className="input" value={form.product_id} onChange={(e) => pickProduct(e.target.value)}>
                  {available.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label className="field">Selling price (฿)
                <input className="input" style={{ width: 130 }} required inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </label>
              <label className="field">Ads per order (฿)
                <input className="input" style={{ width: 130 }} inputMode="decimal" value={form.ads} onChange={(e) => setForm({ ...form, ads: e.target.value })} />
              </label>
              <label className="field">Wear per order (฿)
                <input className="input" style={{ width: 130 }} inputMode="decimal" value={form.wear} onChange={(e) => setForm({ ...form, wear: e.target.value })} />
              </label>
              <button className="btn primary" type="submit">Add to shop</button>
            </form>
          )
        )}
        {listings.length === 0 && !adding && (
          <p className="muted" style={{ margin: '0 24px 20px', fontSize: 14 }}>No products in this shop yet. Use "+ Add product".</p>
        )}
        <div className="scroll-x">
          <div style={{ minWidth: 860 }}>
            <div className="thead" style={GRID}>
              <span>Product</span><span className="r">Selling price</span><span className="r">True cost</span>
              <span className="r">Profit / order</span><span className="r">Margin</span><span>Status</span><span />
            </div>
            {listings.map((l) => {
              const isOpen = open === l.id;
              return (
                <div key={l.id}>
                  <div className="trow" style={{ ...GRID, minHeight: 60 }}>
                    <span style={{ fontWeight: 600 }}>{l.product_name}</span>
                    <span className="r">
                      <span className="with-unit" style={{ justifyContent: 'flex-end' }}>
                        <span className="muted">฿</span>
                        <input
                          className="input sm"
                          style={{ width: 96, textAlign: 'right' }}
                          inputMode="decimal"
                          value={draft(l, 'price')}
                          onChange={(e) => setField(l, 'price', e.target.value)}
                          aria-label={`Selling price of ${l.product_name}`}
                        />
                      </span>
                    </span>
                    <span className="mono r">{baht(l.trueCost)}</span>
                    <span className={`mono r ${tone(l.status)}`}>{baht(l.profit)}</span>
                    <span className={`mono r ${tone(l.status)}`}>{pct(l.margin)}</span>
                    <span><Badge status={l.status} /></span>
                    <span className="r">
                      <button className="btn ghost" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : l.id)}>
                        {isOpen ? 'Hide' : 'Details'}
                      </button>
                      <button className="btn ghost" style={{ color: 'var(--bad)' }} onClick={() => removeProduct(l)} aria-label={`Remove ${l.product_name} from this shop`}>Remove</button>
                    </span>
                  </div>
                  {isOpen && (
                    <div className="detail">
                      <RealityCheck l={l} />
                      <div>
                        <div className="factor">
                          <span>Ingredients <Link to="/costs">Edit in Cost Breakdown</Link></span>
                          <span className="mono">{baht(l.ingredientCost)}</span>
                        </div>
                        <div className="factor"><span>Commission ({fees.commission_pct}%)</span><span className="mono">{baht(l.commission)}</span></div>
                        <div className="factor"><span>Transaction fee ({fees.transaction_pct}%)</span><span className="mono">{baht(l.transaction)}</span></div>
                        {l.extra > 0 || Number(fees.extra_pct) > 0 ? (
                          <div className="factor">
                            <span>Growth / service fee ({fees.extra_pct}%{fees.extra_cap_per_item !== '' ? `, max ${baht(Number(fees.extra_cap_per_item))}` : ''})</span>
                            <span className="mono">{baht(l.extra)}</span>
                          </div>
                        ) : null}
                        {Number(fees.shipping_pct) > 0 && (
                          <div className="factor"><span>Free-shipping program ({fees.shipping_pct}%)</span><span className="mono">{baht(l.shipping)}</span></div>
                        )}
                        {l.fixedFee > 0 && (
                          <div className="factor"><span>Platform fee per order</span><span className="mono">{baht(l.fixedFee)}</span></div>
                        )}
                        <div className="factor">
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>Ads per order
                            <span className="with-unit">฿<input className="input sm" inputMode="decimal" value={draft(l, 'ads')} onChange={(e) => setField(l, 'ads', e.target.value)} /></span>
                          </label>
                          <span className="mono">{baht(l.ads)}</span>
                        </div>
                        <div className="factor">
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>Gas and equipment wear
                            <span className="with-unit">฿<input className="input sm" inputMode="decimal" value={draft(l, 'wear')} onChange={(e) => setField(l, 'wear', e.target.value)} /></span>
                          </label>
                          <span className="mono">{baht(l.wear)}</span>
                        </div>
                        <div className="factor total"><span>True cost</span><span className="mono">{baht(l.trueCost)}</span></div>
                        <div className="factor total"><span>Selling price</span><span className="mono">{baht(l.price)}</span></div>
                        <div className="factor total"><span>Profit per order</span><span className={`mono ${tone(l.status)}`}>{baht(l.profit)}</span></div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}
