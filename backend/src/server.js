import express from 'express';
import { migrate } from './db.js';
import cors from 'cors';
import { suppliesRouter } from './routes/supplies.js';
import { productsRouter } from './routes/products.js';
import { shopsRouter } from './routes/shops.js';
import { chatRouter } from './routes/chat.js';
import { ttsRouter } from './routes/tts.js';
import { sttRouter } from './routes/stt.js';
import { exportRouter } from './routes/export.js';
import { salesRouter } from './routes/sales.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) =>
  res.json({
    ok: true,
    ai: !!process.env.OPENAI_API_KEY,
    stt: !!process.env.OPENAI_API_KEY,
    tts: !!(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID),
  }),
);
for (const router of [suppliesRouter, productsRouter, shopsRouter, chatRouter, ttsRouter, sttRouter, exportRouter, salesRouter]) {
  app.use('/api', router);
}

// Express 5 forwards async errors here.
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

const port = Number(process.env.PORT) || 4000;
await migrate();
app.listen(port, () => console.log(`kumtun backend on :${port}`));
