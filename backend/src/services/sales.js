import { query } from '../db.js';

export const validDate = (s) => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s; // rejects 2026-02-30 style dates
};

// Money for one log row. The cost was frozen when the sale was logged.
export const withMoney = (r) => {
  const revenue = r.qty * r.unit_price;
  const cost = r.qty * r.unit_cost;
  const profit = revenue - cost;
  return { ...r, revenue, cost, profit, margin: revenue > 0 ? (profit / revenue) * 100 : 0 };
};

export const sum = (rows) => {
  const t = rows.reduce(
    (a, r) => ({ units: a.units + r.qty, revenue: a.revenue + r.revenue, cost: a.cost + r.cost, profit: a.profit + r.profit }),
    { units: 0, revenue: 0, cost: 0, profit: 0 },
  );
  return { ...t, margin: t.revenue > 0 ? (t.profit / t.revenue) * 100 : 0 };
};

// Sales between from and to (inclusive, both optional), newest first, with per-day groups.
export async function fetchSales({ storeId, from = null, to = null }) {
  const { rows } = await query(
    `select * from sales where store_id = $3 and deleted_at is null and ($1::date is null or sold_on >= $1) and ($2::date is null or sold_on <= $2)
      order by sold_on desc, id desc`,
    [from, to, storeId],
  );
  const sales = rows.map(withMoney);
  const byDay = new Map();
  for (const s of sales) byDay.set(s.sold_on, [...(byDay.get(s.sold_on) ?? []), s]);
  const days = [...byDay.entries()].map(([date, list]) => ({ date, ...sum(list), sales: list }));
  return { totals: sum(sales), days, sales };
}

// Sales that were deleted and can be restored, newest deletion first.
export async function fetchDeletedSales(storeId) {
  const { rows } = await query('select * from sales where store_id = $1 and deleted_at is not null order by deleted_at desc, id desc', [storeId]);
  return rows.map(withMoney);
}
