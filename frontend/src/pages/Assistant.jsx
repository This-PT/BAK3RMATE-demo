import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, speak, stopSpeaking } from '../api.js';
import { baht, bahtShort, pct, unitName } from '../format.js';
import { useI18n } from '../i18n.jsx';
import { useChat } from '../chat.jsx';
import { dateLocale, translateError } from '../i18n-core.js';

const SOURCES = ['chat', 'receipt', 'manual', 'undo'];

function Impact({ msg, onUndo }) {
  const { t } = useI18n();
  const multiProduct = new Set(msg.impacts.map((i) => i.product)).size > 1;
  return (
    <div className="impact">
      <h3>{t('assistant.impact')}</h3>
      {msg.impacts.map((i, k) => (
        <div className="impact-row" key={k}>
          {i.kind === 'ingredient' ? (
            <>
              <span>{t('assistant.impactIngredient', { product: i.product })}</span>
              <span className="mono">{baht(i.before)} → <strong>{baht(i.after)}</strong></span>
            </>
          ) : (
            <>
              <span>{t('assistant.impactMargin', { shop: `${i.shop}${multiProduct ? ` · ${i.product}` : ''}` })}</span>
              <span className="mono">
                {pct(i.before)} → <strong className={i.after < i.before ? 'bad' : 'good'}>{pct(i.after)}</strong>
              </span>
            </>
          )}
        </div>
      ))}
      <div className="impact-actions">
        <Link className="btn dark" to="/costs">{t('assistant.openCosts')}</Link>
        {msg.changeId && !msg.undone && (
          <button className="btn" onClick={() => onUndo(msg)}>{t('assistant.undo')}</button>
        )}
        {msg.undone && <span className="muted" style={{ alignSelf: 'center', fontSize: 14 }}>{t('assistant.undone')}</span>}
      </div>
    </div>
  );
}

export default function Assistant() {
  const { t } = useI18n();
  // the conversation, the half-typed message and the voice switch live above this page, so changing page keeps them
  const { messages, setMessages, input, setInput, voice, setVoice } = useChat();
  const when = (iso) => {
    const d = new Date(iso);
    if (d.toDateString() === new Date().toDateString()) return t('assistant.today');
    return d.toLocaleDateString(dateLocale(), { month: 'short', day: 'numeric' });
  };
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(null);
  const [changes, setChanges] = useState({ changes: [], products_affected: 0 });
  const [error, setError] = useState('');
  const end = useRef(null);

  const loadChanges = () => api.get('/api/changes?days=7').then(setChanges).catch(() => {});
  useEffect(() => {
    loadChanges();
    return stopSpeaking;
  }, []);
  // braces matter: an effect must not return scrollIntoView's result (it can be a Promise, which React cannot call)
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  const play = (idx, text) => {
    if (playing === idx) {
      stopSpeaking();
      setPlaying(null);
      return;
    }
    setPlaying(idx);
    speak(text, () => setPlaying((p) => (p === idx ? null : p)));
  };

  // --- tap to talk -------------------------------------------------------
  // With an OpenAI key the backend transcribes the recording (Thai + English auto-detected).
  // Without one, fall back to the browser's own speech recognition (Chrome).
  const [caps, setCaps] = useState({ stt: false });
  const [mic, setMic] = useState('idle'); // idle | listening | transcribing
  const [lang, setLang] = useState('th-TH');
  const recorder = useRef(null);
  const recognizer = useRef(null);
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  useEffect(() => {
    api.get('/api/capabilities').then(setCaps).catch(() => {});
  }, []);

  const stopMic = () => {
    recorder.current?.state === 'recording' && recorder.current.stop();
    recognizer.current?.stop();
  };

  const toggleMic = async () => {
    if (mic === 'listening') return stopMic();
    if (mic !== 'idle' || busy) return;
    setError('');
    stopSpeaking();
    setPlaying(null);

    if (caps.stt && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const chunks = [];
        const rec = new MediaRecorder(stream);
        recorder.current = rec;
        rec.ondataavailable = (e) => chunks.push(e.data);
        rec.onstop = async () => {
          stream.getTracks().forEach((track) => track.stop());
          setMic('transcribing');
          try {
            const body = new FormData();
            body.append('audio', new Blob(chunks, { type: rec.mimeType }), 'speech');
            const res = await fetch('/api/stt', { method: 'POST', body });
            if (!res.ok) throw new Error(translateError((await res.json()).error || 'Could not transcribe'));
            const { text } = await res.json();
            if (text?.trim()) await sendText(text.trim());
            else setError(t('assistant.errNoCatch'));
          } catch (err) {
            setError(err.message);
          } finally {
            setMic('idle');
          }
        };
        rec.start();
        setMic('listening');
      } catch {
        setError(t('assistant.errMic'));
      }
      return;
    }

    if (!SR) {
      setError(t('assistant.errUnsupported'));
      return;
    }
    const r = new SR();
    recognizer.current = r;
    r.lang = lang;
    r.interimResults = true;
    let finalText = '';
    r.onresult = (e) => {
      let interim = '';
      finalText = '';
      for (const res of e.results) (res.isFinal ? (finalText += res[0].transcript) : (interim += res[0].transcript));
      setInput(finalText + interim);
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed') setError(t('assistant.errMic'));
      else if (e.error !== 'no-speech' && e.error !== 'aborted') setError(t('assistant.errVoice', { code: e.error }));
    };
    r.onend = () => {
      setMic('idle');
      if (finalText.trim()) {
        setInput('');
        sendText(finalText.trim());
      }
    };
    r.start();
    setMic('listening');
  };

  const sendText = async (raw) => {
    const text = raw.trim();
    if (!text || busy) return;
    setInput('');
    setError('');
    setBusy(true);
    const history = messages.slice(1).map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, { role: 'user', content: text }]);
    try {
      const r = await api.post('/api/chat', { message: text, history });
      setMessages((m) => {
        const next = [...m, { role: 'assistant', content: r.reply, impacts: r.impacts, changeId: r.change_id }];
        if (voice) {
          setPlaying(next.length - 1);
          speak(r.reply, () => setPlaying(null));
        }
        return next;
      });
      loadChanges();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const send = (e) => {
    e.preventDefault();
    sendText(input);
  };

  const undo = async (msg) => {
    try {
      await api.post(`/api/changes/${msg.changeId}/undo`);
      setMessages((m) => m.map((x) => (x === msg ? { ...x, undone: true } : x)));
      loadChanges();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <header className="page-head">
        <div>
          <h1>{t('nav.assistant')}</h1>
          <p>{t('assistant.subtitle')}</p>
        </div>
        <button className="voice-toggle" aria-pressed={voice} onClick={() => { setVoice(!voice); stopSpeaking(); setPlaying(null); }}>
          <span className={`track ${voice ? 'on' : ''}`} aria-hidden="true"><span className="knob" /></span>
          <span>{t('assistant.voiceReplies')}</span><span className="muted">· ElevenLabs</span>
        </button>
      </header>

      <div className="assistant">
        <section className="card chat" aria-label={t('assistant.conversation')}>
          <div className="thread" aria-live="polite">
            {messages.map((m, i) =>
              m.role === 'user' ? (
                <div className="user-msg" key={i}>
                  <div className="bubble" lang={/[฀-๿]/.test(m.content) ? 'th' : 'en'}>{m.content}</div>
                </div>
              ) : (
                <div className="msg" key={i}>
                  <div className="avatar" aria-hidden="true">AI</div>
                  <div className="msg-col">
                    <div className="bubble">{m.greeting ? t('assistant.greeting') : m.content}</div>
                    {m.impacts?.length > 0 && <Impact msg={m} onUndo={undo} />}
                    {i > 0 && (
                      <button className="btn ghost" style={{ alignSelf: 'flex-start' }} onClick={() => play(i, m.content)}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M11 5L6 9H3v6h3l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" />
                        </svg>
                        {playing === i ? t('assistant.playing') : t('assistant.listen')}
                      </button>
                    )}
                  </div>
                </div>
              ),
            )}
            {busy && (
              <div className="msg"><div className="avatar" aria-hidden="true">AI</div><div className="bubble muted">{t('assistant.thinking')}</div></div>
            )}
            <div ref={end} />
          </div>
          {error && <div className="error" style={{ margin: '0 24px 12px' }}>{error}</div>}
          <form className="composer" onSubmit={send}>
            <button
              type="button"
              className={`mic ${mic}`}
              onClick={toggleMic}
              disabled={mic === 'transcribing'}
              aria-pressed={mic === 'listening'}
              aria-label={mic === 'listening' ? t('assistant.micStop') : t('assistant.micTalk')}
              title={mic === 'listening' ? t('assistant.micStopTitle') : t('assistant.micTalk')}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v3" />
              </svg>
            </button>
            {!caps.stt && SR && (
              <label className="sr-only-label">
                <span className="sr-only">{t('assistant.speechLang')}</span>
                <select className="input" style={{ minHeight: 44, padding: '0 8px' }} value={lang} onChange={(e) => setLang(e.target.value)} disabled={mic !== 'idle'}>
                  <option value="th-TH">ไทย</option>
                  <option value="en-US">EN</option>
                </select>
              </label>
            )}
            <label style={{ flex: '1 1 240px', display: 'flex' }}>
              <span className="sr-only">{t('assistant.message')}</span>
              <input
                className="input"
                style={{ flex: 1 }}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={mic === 'listening' ? t('assistant.phListening') : mic === 'transcribing' ? t('assistant.phTranscribing') : t('assistant.phDefault')}
              />
            </label>
            <button className="btn primary" type="submit" disabled={busy || !input.trim()}>{t('assistant.send')}</button>
          </form>
        </section>

        <aside className="card aside-card" aria-label={t('assistant.changesTitle')}>
          <h2>{t('assistant.changesTitle')}</h2>
          {changes.changes.length === 0 && <span className="muted" style={{ fontSize: 14 }}>{t('assistant.noChanges')}</span>}
          {changes.changes.map((c) => (
            <div className="change" key={c.id}>
              <div className="change-top">
                <span style={{ fontWeight: 600 }}>{c.supply_name}</span>
                <span className={`badge ${c.change_pct > 0 ? 'up' : 'ok'}`}>
                  {c.change_pct > 0 ? '+' : c.change_pct < 0 ? '−' : ''}{Math.abs(c.change_pct).toFixed(0)}%
                </span>
              </div>
              <span className="mono" style={{ fontSize: 14 }}>{bahtShort(c.old_cost)} → {bahtShort(c.new_cost)} / {unitName(c.unit)}</span>
              <span className="muted" style={{ fontSize: 13 }}>{SOURCES.includes(c.source) ? t(`source.${c.source}`) : c.source} · {when(c.created_at)}</span>
            </div>
          ))}
          {changes.products_affected > 0 && (
            <Link to="/shops" style={{ fontSize: 14, fontWeight: 600 }}>
              {t('assistant.affected', { n: changes.products_affected })}
            </Link>
          )}
        </aside>
      </div>
    </>
  );
}
