import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getLang, setLanguage, t } from './i18n-core.js';

const Ctx = createContext(null);

// Gives every screen the current language. Changing it re-renders the app in the other language.
export function I18nProvider({ children }) {
  const [lang, setLang] = useState(getLang());

  const change = useCallback((next) => {
    setLanguage(next);
    setLang(getLang());
  }, []);

  useEffect(() => {
    document.title = t('app.title');
  }, [lang]);

  // a new `t` for each language, so anything that depends on it updates
  const value = useMemo(() => ({ lang, setLang: change, t: (key, vars) => t(key, vars) }), [lang, change]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
