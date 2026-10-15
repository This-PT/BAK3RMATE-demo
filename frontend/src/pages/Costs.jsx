import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { baht, pct } from '../format.js';
import CostBreakdown from '../components/CostBreakdown.jsx';

const tone = (s) => (s === 'losing' ? 'bad' : s === 'thin' ? 'warn' : 'good');

export default function Costs() {
  const [products, setProducts] = useState([]);
  const [productId, setProductId] = useState(null);
  const [edits, setEdits] = useState({}); // supply_id -> typed string (what-if only)
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/api/products').then((p) => {
      setProducts(p);
      setProductId(p[0]?.id ?? null);
    }).catch((e) => setError(e.message));
  }, []);

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
        <button className="btn" onClick={() => setEdits({})} disabled={Object.keys(edits).length === 0}>Reset to Supply prices</button>
      </header>
      {error && <div className="error">{error}</div>}

      <div className="pills" role="group" aria-label="Product">
        {products.map((p) => (
          <button key={p.id} className="pill" aria-pressed={p.id === productId} onClick={() => pick(p.id)}>{p.name}</button>
        ))}
      </div>

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
