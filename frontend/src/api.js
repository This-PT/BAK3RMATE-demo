import { translateError } from './i18n-core.js';

// The store every data request belongs to. Set by the store provider.
let storeId = null;
export const setStoreId = (id) => { storeId = id; };

// Called when the server says the login has ended, so the app can show the login page.
let onUnauthorized = null;
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

async function request(method, url, body) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (storeId) headers['X-Store-Id'] = String(storeId);
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && !url.startsWith('/api/auth/')) onUnauthorized?.();
  if (!res.ok) {
    let msg = res.statusText;
    try {
      msg = (await res.json()).error || msg;
    } catch {
      /* not json */
    }
    throw new Error(translateError(msg));
  }
  return res;
}

const json = async (method, url, body) => (await request(method, url, body)).json();

export const api = {
  get: (url) => json('GET', url),
  post: (url, body) => json('POST', url, body ?? {}),
  patch: (url, body) => json('PATCH', url, body),
  del: (url) => json('DELETE', url),
  blob: async (url) => request('GET', url),
};

// Play a spoken reply: ElevenLabs via the backend, browser voice as fallback.
let current = null;
export function stopSpeaking() {
  if (current) {
    current.pause();
    current = null;
  }
  window.speechSynthesis?.cancel();
}

export async function speak(text, onEnd) {
  stopSpeaking();
  try {
    const res = await request('POST', '/api/tts', { text });
    const url = URL.createObjectURL(await res.blob());
    const audio = new Audio(url);
    current = audio;
    audio.onended = () => {
      URL.revokeObjectURL(url);
      onEnd?.();
    };
    await audio.play();
  } catch {
    if (!window.speechSynthesis) return onEnd?.();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = /[฀-๿]/.test(text) ? 'th-TH' : 'en-US';
    u.onend = () => onEnd?.();
    window.speechSynthesis.speak(u);
  }
}

// Download a generated file (e.g. the Excel export). Returns the file name.
export async function downloadFile(url) {
  const res = await request('GET', url);
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || 'kumtun-export.xlsx';
  const href = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
  return name;
}
