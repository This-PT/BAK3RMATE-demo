import { useI18n } from '../i18n.jsx';
import { PLANS, usePlan } from '../plan.jsx';
import { useStores } from '../store.jsx';

// Demo only: picking a plan sets how many stores can be created. No payment.
export default function PlanPicker() {
  const { t } = useI18n();
  const { plan, setPlan, storeLimit } = usePlan();
  const { stores } = useStores();
  return (
    <div className="plan-bar">
      <label className="plan-pick">
        <span className="muted">{t('plan.label')}</span>
        <select className="input sm" value={plan} onChange={(e) => setPlan(e.target.value)} aria-label={t('plan.label')}>
          {Object.keys(PLANS).map((p) => <option key={p} value={p}>{t(`plan.${p}`)}</option>)}
        </select>
      </label>
      <span className="muted plan-note">{t('plan.usage', { n: stores?.length ?? 0, max: storeLimit })} · {t('plan.demo')}</span>
    </div>
  );
}
