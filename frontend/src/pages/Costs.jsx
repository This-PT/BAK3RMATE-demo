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

const tone = (s) => (s === 'losing' ? 'bad' : s === 'thin' ? 'warn' : 'good');

export default function Costs() {
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
    const t = setTimeout(() => {
      api.post(`/api/products/${productId}/preview`, { overrides }).then(setPreview).catch((e) => setError(e.message));
    }, 150);
    return () => clearTimeout(t);
  }, [productId, edits]);

  const product = products.find((p) => p.id === productId);
  const pick = (id) => { setProductId(id); setEdits({}); setPreview(null); };

  // "Delete" only moves the product to the trash below. Nothing is lost until "Delete forever".
  const deleteProduct = async () => {
    if (!window.confirm(`Delete "${product.name}"?\n\nIt moves to "Deleted products" below, so you can restore it later with its recipe and shop prices.`)) return;
    setError('');
    try {
      await api.del(`/api/products/${product.id}`);
      setNotice(`"${product.name}" was moved to Deleted products. You can restore it below.`);
      await Promise.all([loadProducts(), loadTrash()]);
    } catch (e) {
      setError(e.message);
    }
  };

  const restoreProduct = async (p) => {
    setError('');
    try {
      await api.post(`/api/products/${p.id}/restore`);
      setNotice(`"${p.name}" is back${p.shop_count ? `, in ${p.shop_count} ${p.shop_count === 1 ? 'shop' : 'shops'} with its old prices` : ''}.`);
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
          <h1>Cost Breakdown</h1>
          <p>AI read your recipe and priced each ingredient from Supply. Change any price to see the new cost instantly.</p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button className="btn" onClick={() => setEdits({})} disabled={Object.keys(edits).length === 0}>Reset to Supply prices</button>
          {hasOthers && <button className="btn" onClick={() => { setImporting(!importing); setCreating(false); setNotice(''); }}>{importing ? 'Cancel import' : 'Import from another store'}</button>}
          {product && <button className="btn danger" onClick={deleteProduct}>Delete product</button>}
        </div>
      </header>
      {error && <div className="error">{error}</div>}
      {notice && <div className="notice" role="status">{notice}</div>}

      <div className="pills" role="group" aria-label="Product">
        {products.map((p) => (
          <button key={p.id} className="pill" aria-pressed={p.id === productId} onClick={() => pick(p.id)}>{p.name}</button>
        ))}
        <button className="pill add" onClick={() => { setCreating(true); setImporting(false); }}>+ New product</button>
      </div>

      {importing && (
        <ImportProducts
          haveNames={new Set(products.map((p) => p.name.toLowerCase()))}
          onCancel={() => setImporting(false)}
          onDone={async (r) => {
            setImporting(false);
            const parts = [`Copied ${r.added.length} ${r.added.length === 1 ? 'product' : 'products'} from ${r.from}: ${r.added.join(', ')}.`];
            if (r.new_supplies.length) parts.push(`Also added the ingredients ${r.new_supplies.join(', ')} (no stock yet).`);
            if (r.skipped.length) parts.push(`Skipped ${r.skipped.join(', ')} (already here).`);
            parts.push('Put them in a shop on the Shops page to set a selling price.');
            setNotice(parts.join(' '));
            await loadProducts();
          }}
        />
      )}

      <TrashList
        title="Deleted products"
        items={trash.map((p) => ({ id: p.id, title: p.name, detail: `Deleted ${shortDate(p.deleted_at)} · was in ${p.shop_count} ${p.shop_count === 1 ? 'shop' : 'shops'}`, raw: p }))}
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
          <p style={{ margin: '0 0 12px' }}>No products in this store yet. Add your first one with its recipe and the app will work out what it costs you.</p>
          <button className="btn primary" onClick={() => setCreating(true)}>+ New product</button>
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
          <aside className="side" aria-label="Summary">
            <div className="hero">
              <span className="label">Ingredient cost per unit</span>
              <span className="big">{baht(preview.ingredient_cost)}</span>
              <span className="sub">{baht(preview.per_piece)} per piece</span>
            </div>
            <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Used in your shops</h2>
              {preview.listings.map((l) => (
                <div key={l.id} style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingBottom: 12, borderBottom: '1px solid var(--line-soft)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontWeight: 500 }}>{l.shop_name}</span>
                    <span className="mono">{baht(l.price)}</span>
                  </div>
                  <span className="muted" style={{ fontSize: 13 }}>
                    Profit after fees: <strong className={`mono ${tone(l.status)}`}>{baht(l.profit)}</strong> ({pct(l.margin)} margin)
                  </span>
                </div>
              ))}
              <Link className="btn dark" to="/shops">See full price breakdown in Shops</Link>
            </div>
            <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.55 }}>
              Edits here are a what-if. To save a new price for everyone, update it in Supply or tell the AI Assistant.
            </p>
          </aside>
        </div>
      )}
    </>
  );
}
