import { baht, pct } from '../format.js';

const tone = (s) => (s === 'losing' ? 'bad' : s === 'thin' ? 'warn' : 'good');

export default function RealityCheck({ l }) {
  return (
    <div>
      <span className="reality-title">Reality check</span>
      <div className="reality">
        <div>
          <small>You think you make</small>
          <span className="pct">{pct(l.thinkMargin)}</span>
          <small>{baht(l.thinkProfit)} / order · price minus ingredients</small>
        </div>
        <div>
          <small>You actually make</small>
          <span className={`pct ${tone(l.status)}`}>{pct(l.margin)}</span>
          <small>{baht(l.profit)} / order · after every cost</small>
        </div>
      </div>
      <div className="breakeven">
        <span>Break-even selling price</span>
        <strong className="mono">{l.breakEven === null ? 'n/a' : baht(l.breakEven)}</strong>
      </div>
    </div>
  );
}
