import { Router } from 'express';
import { createHash } from 'node:crypto';

export const ttsRouter = Router();
const cache = new Map();

ttsRouter.post('/tts', async (req, res) => {
  const text = String(req.body?.text ?? '').trim().slice(0, 600);
  const key = process.env.ELEVENLABS_API_KEY;
  const voice = process.env.ELEVENLABS_VOICE_ID;
  if (!text) return res.status(400).json({ error: 'text is required' });
  if (!key || !voice) return res.status(503).json({ error: 'TTS not configured' });

  const hash = createHash('sha1').update(voice + text).digest('hex');
  let audio = cache.get(hash);
  if (!audio) {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2' }),
    });
    if (!r.ok) return res.status(502).json({ error: `ElevenLabs ${r.status}` });
    audio = Buffer.from(await r.arrayBuffer());
    cache.set(hash, audio);
  }
  res.set('Content-Type', 'audio/mpeg').send(audio);
});
