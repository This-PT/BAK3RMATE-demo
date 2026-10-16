// Two languages: English (en) and Thai (th). Text lives in locales/en.js and locales/th.js, keyed by name.
// This file has no React in it, so plain helpers (dates, formatting, the API layer) can translate too.
import en from './locales/en.js';
import th from './locales/th.js';
import { thaiErrors } from './locales/errors.th.js';

const dicts = { en, th };
const STORAGE_KEY = 'kumtun.lang';
export const LANGS = ['en', 'th'];

// Remembered choice first; otherwise follow the browser (Thai browsers get Thai).
function initial() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (LANGS.includes(saved)) return saved;
  } catch {
    /* private mode or no browser: fall through */
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language || '' : '';
  return nav.toLowerCase().startsWith('th') ? 'th' : 'en';
}

let current = initial();
if (typeof document !== 'undefined') document.documentElement.lang = current;

export const getLang = () => current;

export function setLanguage(lang) {
  if (!LANGS.includes(lang)) return;
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* not remembered, still works */
  }
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}

// The locale for dates and numbers. Thai uses the Thai (Buddhist-era) calendar, as people expect there.
export const dateLocale = () => (current === 'th' ? 'th-TH' : 'en-GB');

// t('key') or t('key', { name: 'x', n: 3 }). {name} is replaced. With n, "key_one" is used when n is 1 (English plurals).
export function t(key, vars) {
  const pick = (dict) => (vars && vars.n === 1 && dict[`${key}_one`] !== undefined ? dict[`${key}_one`] : dict[key]);
  const text = pick(dicts[current]) ?? pick(dicts.en) ?? key;
  return vars ? text.replace(/\{(\w+)\}/g, (_, name) => (vars[name] !== undefined ? String(vars[name]) : `{${name}}`)) : text;
}

// Server error messages come in English. In Thai mode, known ones are shown in Thai; anything else stays as it is.
export function translateError(message) {
  if (current !== 'th' || typeof message !== 'string') return message;
  for (const [pattern, thai] of thaiErrors) {
    if (typeof pattern === 'string') {
      if (message === pattern) return thai;
    } else {
      const m = message.match(pattern);
      if (m) return thai.replace(/\$(\d)/g, (_, i) => m[Number(i)] ?? '');
    }
  }
  return message;
}
