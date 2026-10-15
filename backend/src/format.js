export const baht = (n) => (n < 0 ? '−' : '') + '฿' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pct = (n) => (n < 0 ? '−' : '') + Math.abs(n).toFixed(1) + '%';
