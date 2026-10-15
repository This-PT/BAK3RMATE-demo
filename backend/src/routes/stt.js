import { Router } from 'express';
import multer from 'multer';
import OpenAI, { toFile } from 'openai';

export const sttRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Speech to text for the mic button. Thai and English are detected automatically.
sttRouter.post('/stt', upload.single('audio'), async (req, res) => {
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'STT not configured' });
  if (!req.file) return res.status(400).json({ error: 'audio file is required' });
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const ext = req.file.mimetype.includes('mp4') ? 'mp4' : req.file.mimetype.includes('ogg') ? 'ogg' : 'webm';
  const out = await client.audio.transcriptions.create({
    file: await toFile(req.file.buffer, `speech.${ext}`, { type: req.file.mimetype }),
    model: process.env.OPENAI_STT_MODEL || 'gpt-4o-transcribe',
  });
  res.json({ text: out.text });
});
