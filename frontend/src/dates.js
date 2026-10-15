// Local calendar dates as YYYY-MM-DD (no timezone shifting)
export const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return ymd(d);
};
export const dayLabel = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

export const RANGES = [
  { key: 'today', label: 'Today', from: () => daysAgo(0) },
  { key: '7', label: 'Last 7 days', from: () => daysAgo(6) },
  { key: '30', label: 'Last 30 days', from: () => daysAgo(29) },
  { key: 'all', label: 'All time', from: () => null },
];

// ?sales_from=...&sales_to=... for the Excel export (empty for all time)
export const salesRangeQuery = (key) => {
  const from = RANGES.find((r) => r.key === key).from();
  return from ? `sales_from=${from}&sales_to=${daysAgo(0)}` : '';
};

// 15 Oct
export const shortDate = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
