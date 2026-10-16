import { t } from './i18n-core.js';

export const baht = (n) =>
  (n < -0.005 ? '−' : '') + '฿' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// whole-baht values like ฿450 or ฿3,551
export const bahtShort = (n) =>
  (n < 0 ? '−' : '') +
  '฿' +
  Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });

export const pct = (n) => (n < 0 ? '−' : '') + Math.abs(n).toFixed(1) + '%';

// "Healthy", "Thin margin", "Losing money" in the current language
export const statusLabel = (status) => t(`status.${status}`);

// units: kg / pc. unitLabel = "per kg", unitName = "kg", unitCount = "kg" or "pcs" (for a stock amount)
export const unitLabel = (u) => t(u === 'kg' ? 'unit.perKg' : 'unit.perPc');
export const unitName = (u) => t(u === 'kg' ? 'unit.kg' : 'unit.pc');
export const unitCount = (u) => t(u === 'kg' ? 'unit.kg' : 'unit.pcs');
