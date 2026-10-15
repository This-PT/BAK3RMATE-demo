export default function KpiCard({ label, value, sub, tone }) {
  return (
    <div className="card kpi">
      <span className="label">{label}</span>
      <span className={`value ${tone || ''}`}>{value}</span>
      {sub && <span className="sub">{sub}</span>}
    </div>
  );
}
