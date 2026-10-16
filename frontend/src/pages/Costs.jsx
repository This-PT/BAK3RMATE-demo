import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { baht, pct } from '../format.js';
import CostBreakdown from '../components/CostBreakdown.jsx';
import NewProductForm from '../components/NewProductForm.jsx';
import ImportProducts from '../components/ImportProducts.jsx';
import TrashList from '../components/TrashList.jsx';
import { shortDate } from '../dates.js';
import { useStores } from '../store.jsx';
import { useI18n } from '../i18n.jsx';

const tone = (s) => (s === 'losing' ? 'bad' : s === 'thin' ? 'warn' : 'good');

export default function Costs() {
  const { t } = useI18n();
  const { stores, current } = useStores();
  const hasOthers = stores.some((s) => s.id !== current.id);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState('');
  const [trash, setTrash] = useState([]);
  const [products, setProducts] = useState([]);
  const [productId, setProductId] = useState(null);
  const [edits, setEdits] = useState({}); // supply_id -> typed string (what-if only)
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState(false);

  const loadTrash = () => api.get('/api/products/deleted').then(setTrash).catch((e) => setError(e.message));

  const loadProducts = (selectId) =>
    api.get('/api/products').then((p) => {
      setProducts(p);
      setProductId((cur) => selectId ?? (p.some((x) => x.id === cur) ? cur : p[0]?.id ?? null));
      setPreview(null);
      setEdits({});
    }).catch((e) => setError(e.message)).finally(() => setLoaded(true));

  useEffect(() => { loadProducts(); loadTrash(); }, []);

  // Ask the engine for the what-if numbers whenever an edit changes.
  useEffect(() => {
    if (!productId) return;
    const overrides = {};
    for (const [k, v] of Object.entries(edits)) {
      if (v !== '' && Number.isFinite(Number(v))) overrides[k] = Number(v);
    }
    const timer = setTimeout(() => {
      api.post(`/api/products/${productId}/preview`, { overrides }).then(setPreview).catch((e) => setError(e.message));
    }, 150);
    return () => clearTimeout(timer);
  }, [productId, edits]);

  const product = products.find((p) => p.id === productId);
  const pick = (id) => { setProductId(id); setEdits({}); setPreview(null); };

  // "Delete" only moves the product to the "Deleted products" list below; it can be restored.
  const deleteProduct = async () => {
    if (!window.confirm(t('costs.confirmDelete', { name: product.name }))) return;
    setError('');
    try {
      await api.del(`/api/products/${product.id}`);
      setNotice(t('costs.movedToDeleted', { name: product.name }));
      await Promise.all([loadProducts(), loadTrash()]);
    } catch (e) {
      setError(e.message);
    }
  };

  const restoreProduct = async (p) => {
    setError('');
    try {
      await api.post(`/api/products/${p.id}/restore`);
      setNotice(p.shop_count ? t('costs.restoredInShops', { name: p.name, n: p.shop_count }) : t('costs.restored', { name: p.name }));
      await Promise.all([loadProducts(p.id), loadTrash()]);
    } catch (e) {
      setError(e.message);
    }
  };

  const rows = product && preview
    ? product.recipe.map((r) => {
        const p = preview.recipe.find((x) => x.supply_id === r.supply_id);
        return {
          ...r,
          price: edits[r.supply_id] ?? String(r.unit_cost),
          cost: p.cost,
          edited: p.edited,
        };
      })
    : [];

  return (
    <>
      <header className="page-head">
        <div>
          <h1>{t('nav.costs')}</h1>
          <p>{t('costs.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button className="btn" onClick={() => setEdits({})} disabled={Object.keys(edits).length === 0}>{t('costs.reset')}</button>
          {hasOthers && <button className="btn" onClick={() => { setImporting(!importing); setCreating(false); setNotice(''); }}>{importing ? t('common.cancelImport') : t('common.importFromStore')}</button>}
          {product && <button className="btn danger" onClick={deleteProduct}>{t('costs.deleteProduct')}</button>}
        </div>
      </header>
      {error && <div className="error">{error}</div>}
      {notice && <div className="notice" role="status">{notice}</div>}

      <div className="pills" role="group" aria-label={t('common.product')}>
        {products.map((p) => (
          <button key={p.id} className="pill" aria-pressed={p.id === productId} onClick={() => pick(p.id)}>{p.name}</button>
        ))}
        <button className="pill add" onClick={() => { setCreating(true); setImporting(false); }}>{t('costs.newProductPlus')}</button>
      </div>

      {importing && (
        <ImportProducts
          haveNames={new Set(products.map((p) => p.name.toLowerCase()))}
          onCancel={() => setImporting(false)}
          onDone={async (r) => {
            setImporting(false);
            const parts = [t('costs.importDone', { n: r.added.length, from: r.from, names: r.added.join(', ') })];
            if (r.new_supplies.length) parts.push(t('costs.importAlsoAdded', { names: r.new_supplies.join(', ') }));
            if (r.skipped.length) parts.push(t('common.skipped', { names: r.skipped.join(', ') }));
            parts.push(t('costs.importPutInShop'));
            setNotice(parts.join(' '));
            await loadProducts();
          }}
        />
      )}

      <TrashList
        title={t('costs.deletedTitle')}
        items={trash.map((p) => ({ id: p.id, title: p.name, detail: t('costs.deletedDetail', { date: shortDate(p.deleted_at), n: p.shop_count }), raw: p }))}
        onRestore={(it) => restoreProduct(it.raw)}
      />

      {creating && (
        <NewProductForm
          onCancel={() => setCreating(false)}
          onSaved={async (id) => { setCreating(false); await loadProducts(id); }}
        />
      )}

      {loaded && products.length === 0 && !creating && !importing && (
        <div className="card card-pad">
          <p style={{ margin: '0 0 12px' }}>{t('costs.empty')}</p>
          <button className="btn primary" onClick={() => setCreating(true)}>{t('costs.newProductPlus')}</button>
        </div>
      )}

      {product && preview && (
        <div className="cols">
          <div className="grow">
            <CostBreakdown
              title={product.name}
              rows={rows}
              total={preview.ingredient_cost}
              onEdit={(id, v) => setEdits((e) => ({ ...e, [id]: v }))}
            />
          </div>
          <aside className="side" aria-label={t('costs.summary')}>
            <div className="hero">
              <span className="label">{t('costs.costPerUnit')}</span>
              <span className="big">{baht(preview.ingredient_cost)}</span>
              <span className="sub">{t('costs.perPiece', { amount: baht(preview.per_piece) })}</span>
            </div>
            <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{t('costs.usedInShops')}</h2>
              {preview.listings.map((l) => (
                <div key={l.id} style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingBottom: 12, borderBottom: '1px solid var(--line-soft)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontWeight: 500 }}>{l.shop_name}</span>
                    <span className="mono">{baht(l.price)}</span>
                  </div>
                  <span className="muted" style={{ fontSize: 13 }}>
                    {t('costs.profitAfterFees')} <strong className={`mono ${tone(l.status)}`}>{baht(l.profit)}</strong> {t('costs.marginNote', { pct: pct(l.margin) })}
                  </span>
                </div>
              ))}
              <Link className="btn dark" to="/shops">{t('costs.seeInShops')}</Link>
            </div>
            <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.55 }}>
              {t('costs.whatIfNote')}
            </p>
          </aside>
        </div>
      )}
    </>
  );
}
