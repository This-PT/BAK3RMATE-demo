export const baht = (n) =>
  (n < -0.005 ? '−' : '') + '฿' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// whole-baht values like ฿450 or ฿3,551
export const bahtShort = (n) =>
  (n < 0 ? '−' : '') +
  '฿' +
  Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });

export const pct = (n) => (n < 0 ? '−' : '') + Math.abs(n).toFixed(1) + '%';

export const STATUS_LABEL = { losing: 'Losing money', thin: 'Thin margin', healthy: 'Healthy' };

export const unitLabel = (u) => (u === 'kg' ? 'per kg' : 'per pc');
