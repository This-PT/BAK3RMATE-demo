import { baht, unitLabel } from '../format.js';

const GRID = { gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr) minmax(0,1.4fr) minmax(0,1fr)' };

// Ingredient table with editable unit prices. `rows` come from /api/products merged with
// the /preview response, so every cost shown here was computed by the engine.
export default function CostBreakdown({ title, rows, total, onEdit }) {
  return (
    <section className="card" aria-label="Ingredients">
      <div className="card-pad" style={{ paddingBottom: 12, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{title}</h2>
        <span className="muted" style={{ fontSize: 13 }}>Ingredients found by AI from your recipe</span>
      </div>
      <div className="scroll-x">
        <div style={{ minWidth: 600 }}>
          <div className="thead" style={GRID}>
            <span>Ingredient</span><span>Used per unit</span><span>Unit price</span><span className="r">Cost</span>
          </div>
          {rows.map((r) => (
            <div className="trow" style={{ ...GRID, minHeight: 56 }} key={r.supply_id}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontWeight: 500 }}>
                {r.name}
                {r.edited && <span className="badge edited">Edited</span>}
              </span>
              <span className="mono" style={{ fontSize: 14 }}>{r.display}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="mono muted" style={{ fontSize: 14 }}>฿</span>
                <input
                  className="input sm"
                  inputMode="decimal"
                  value={r.price}
                  onChange={(e) => onEdit(r.supply_id, e.target.value)}
                  aria-label={`Unit price for ${r.name}`}
                />
                <span className="muted" style={{ fontSize: 13 }}>{unitLabel(r.unit)}</span>
              </span>
              <span className="mono r">{baht(r.cost)}</span>
            </div>
          ))}
          <div className="trow" style={{ ...GRID, minHeight: 60, borderBottom: 'none' }}>
            <span></span><span></span>
            <span className="r" style={{ fontWeight: 600 }}>Ingredient cost</span>
            <span className="mono r" style={{ fontSize: 17, fontWeight: 600 }}>{baht(total)}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
