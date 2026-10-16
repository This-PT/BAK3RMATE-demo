import { baht, pct } from '../format.js';
import { useI18n } from '../i18n.jsx';

const tone = (s) => (s === 'losing' ? 'bad' : s === 'thin' ? 'warn' : 'good');

export default function RealityCheck({ l }) {
  const { t } = useI18n();
  return (
    <div>
      <span className="reality-title">{t('reality.title')}</span>
      <div className="reality">
        <div>
          <small>{t('reality.youThink')}</small>
          <span className="pct">{pct(l.thinkMargin)}</span>
          <small>{t('reality.thinkNote', { profit: baht(l.thinkProfit) })}</small>
        </div>
        <div>
          <small>{t('reality.youActually')}</small>
          <span className={`pct ${tone(l.status)}`}>{pct(l.margin)}</span>
          <small>{t('reality.actualNote', { profit: baht(l.profit) })}</small>
        </div>
      </div>
      <div className="breakeven">
        <span>{t('reality.breakEven')}</span>
        <strong className="mono">{l.breakEven === null ? t('common.na') : baht(l.breakEven)}</strong>
      </div>
    </div>
  );
}
