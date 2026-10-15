import { Router } from 'express';
import { chat } from '../ai/chat.js';

export const chatRouter = Router();

chatRouter.post('/chat', async (req, res) => {
  const message = String(req.body?.message ?? '').trim();
  if (!message) return res.status(400).json({ error: 'message is required' });
  res.json(await chat({ message, history: req.body.history }));
});
