import express from 'express';
import { prepareDatabase } from './db.js';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { suppliesRouter } from './routes/supplies.js';
import { productsRouter } from './routes/products.js';
import { shopsRouter } from './routes/shops.js';
import { chatRouter } from './routes/chat.js';
import { ttsRouter } from './routes/tts.js';
import { sttRouter } from './routes/stt.js';
import { exportRouter } from './routes/export.js';
import { salesRouter } from './routes/sales.js';
import { storesRouter } from './routes/stores.js';
import { storeContext } from './store.js';
import { authRouter } from './routes/auth.js';
import { originCheck, requireAuth } from './auth/middleware.js';
import { dailyAiCap, limit } from './auth/limits.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS) || 1); // proxies in front of the app (nginx = 1; add one if another proxy such as Caddy sits before nginx)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  next();
});
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
// Sign-in routes are open; everything else needs a logged-in person. Store routes need no selected store.
app.use('/api', originCheck);
app.use('/api/auth', authRouter);
app.use('/api', requireAuth);
// which optional features this server has keys for (only shown to logged-in people)
app.get('/api/capabilities', (_req, res) =>
  res.json({
    ai: !!process.env.OPENAI_API_KEY,
    stt: !!process.env.OPENAI_API_KEY,
    tts: !!(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID),
  }),
);
app.use(['/api/chat', '/api/tts', '/api/stt'], limit('ai', 40, 60_000, (req) => req.user.id), dailyAiCap); // protects your OpenAI / ElevenLabs credit
app.use('/api', storesRouter);
app.use('/api', storeContext);
for (const router of [suppliesRouter, productsRouter, shopsRouter, chatRouter, ttsRouter, sttRouter, exportRouter, salesRouter]) {
  app.use('/api', router);
}

// One-container mode: when the built website is next to the app (see the root Dockerfile), serve it from here too,
// so the website and the API share one address (needed for login cookies). With Docker Compose, nginx does this instead.
const publicDir = process.env.PUBLIC_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
if (fs.existsSync(path.join(publicDir, 'index.html'))) {
  app.use(
    express.static(publicDir, {
      index: false,
      setHeaders(res, file) {
        // files in /assets have a fingerprint in their name, so browsers may keep them for a year; the page itself must stay fresh
        res.setHeader('Cache-Control', file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    }),
  );
  app.get(/^\/(?!api(\/|$)).*/, (_req, res) => res.sendFile(path.join(publicDir, 'index.html'), { headers: { 'Cache-Control': 'no-cache' } }));
}

// Express 5 forwards async errors here.
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message });
});

const port = Number(process.env.PORT) || 4000;
await prepareDatabase();
app.listen(port, () => console.log(`kumtun backend on :${port}`));
