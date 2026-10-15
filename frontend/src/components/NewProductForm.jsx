import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

const blank = () => ({ supply_id: '', quantity: '' });

// Create a product and its recipe. Amounts are in grams for supplies counted in kg, and in pieces for the rest.
export default function NewProductForm({ onSaved, onCancel }) {
  const [supplies, setSupplies] = useState(null);
  const [name, setName] = useState('');
  const [pieces, setPieces] = useState('1');
  const [rows, setRows] = useState([blank()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/api/supplies').then((d) => setSupplies(d.supplies)).catch((e) => setError(e.message));
  }, []);

  const setRow = (i, patch) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const unitOf = (id) => supplies?.find((s) => String(s.id) === String(id))?.unit;

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const { id } = await api.post('/api/products', {
        name: name.trim(),
        pieces: Number(pieces),
        recipe: rows.map((r) => ({ supply_id: Number(r.supply_id), quantity: Number(r.quantity) })),
      });
      onSaved(id);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  if (supplies && supplies.length === 0) {
    return (
      <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ margin: 0 }}>This store has no supplies yet. A recipe is made from supplies, so add the ingredients first.</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link className="btn primary" to="/supply">Go to Supply</Link>
          <button className="btn" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <form className="card card-pad" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>New product</h2>
      {error && <div className="error">{error}</div>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        <label className="field" style={{ flex: '1 1 260px' }}>Product name
          <input className="input" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Banana cake" />
        </label>
        <label className="field">Pieces per unit sold
          <input className="input" style={{ width: 120 }} type="number" min="1" max="1000" step="1" required value={pieces} onChange={(e) => setPieces(e.target.value)} />
        </label>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span className="field">Recipe: what one unit uses</span>
        {rows.map((r, i) => {
          const unit = unitOf(r.supply_id);
          return (
            <div key={i} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              <select className="input" style={{ flex: '1 1 220px' }} required value={r.supply_id} onChange={(e) => setRow(i, { supply_id: e.target.value })} aria-label={`Ingredient ${i + 1}`}>
                <option value="" disabled>Choose an ingredient…</option>
                {(supplies ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <input
                className="input"
                style={{ width: 120 }}
                inputMode="decimal"
                required
                value={r.quantity}
                onChange={(e) => setRow(i, { quantity: e.target.value })}
                aria-label={`Amount of ingredient ${i + 1}`}
                placeholder="Amount"
              />
              <span className="muted" style={{ minWidth: 40 }}>{unit === 'kg' ? 'grams' : unit === 'pc' ? 'pieces' : ''}</span>
              <button type="button" className="btn ghost" style={{ color: 'var(--bad)' }} onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))} disabled={rows.length === 1} aria-label={`Remove ingredient ${i + 1}`}>Remove</button>
            </div>
          );
        })}
        <div><button type="button" className="btn" onClick={() => setRows((rs) => [...rs, blank()])}>+ Add ingredient</button></div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn primary" type="submit" disabled={saving || !supplies}>{saving ? 'Saving…' : 'Save product'}</button>
        <button className="btn" type="button" onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>After saving, put the product in a shop on the Shops page and set its selling price there.</p>
    </form>
  );
}
