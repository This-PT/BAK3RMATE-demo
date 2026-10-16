import { useI18n } from '../i18n.jsx';

// EN | ไทย. Written in each language's own name so it can always be found.
export default function LangSwitch({ variant = 'light' }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div className={`lang-switch ${variant}`} role="group" aria-label={t('lang.label')}>
      <button type="button" aria-pressed={lang === 'en'} lang="en" onClick={() => setLang('en')}>EN</button>
      <button type="button" aria-pressed={lang === 'th'} lang="th" onClick={() => setLang('th')}>ไทย</button>
    </div>
  );
}
