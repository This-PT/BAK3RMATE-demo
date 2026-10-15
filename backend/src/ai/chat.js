import OpenAI from 'openai';
import { toolSchemas, handlers } from './tools.js';
import { fallbackChat } from './fallback.js';

const SYSTEM = `You are the AI assistant of Kumtun, a back office for small online sellers in Thailand.
- Reply in the user's language (Thai in, Thai out; English in, English out )(make sure it is the right form).
- Never calculate. Only report numbers that come from tool results.
- If the supply or product is unclear, ask one short question.
- Keep replies under 60 words.
- Use tools to change prices or look up profit. Do not guess.`;

const MAX_ROUNDS = 4;

// Decided in code, not by the model: Thai script in the message means Thai, anything else English.
function languageRule(message) {
  if (/[฀-๿]/.test(message)) {
    return "The user's latest message is in Thai. Reply in Thai only, in natural polite spoken Thai, ending sentences with the particles ค่ะ / คะ. Keep product and supply names as shown in tool results.";
  }
  return "The user's latest message is in English. Reply in English only, even if earlier messages or the shop context are Thai.";
}

export async function chat({ message, history = [], storeId }) {
  if (!process.env.OPENAI_API_KEY) return { ...(await fallbackChat(message, storeId)), mode: 'offline' };
  try {
    return { ...(await llmChat(message, history, storeId)), mode: 'ai' };
  } catch (err) {
    console.error('LLM failed, using offline fallback:', err.message);
    return { ...(await fallbackChat(message, storeId)), mode: 'offline' };
  }
}

async function llmChat(message, history, storeId) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const messages = [
    { role: 'system', content: SYSTEM },
    ...history.filter((h) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string').slice(-10),
    { role: 'system', content: languageRule(message) },
    { role: 'user', content: message },
  ];
  const impacts = [];
  let changeId = null;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      messages,
      tools: toolSchemas,
    });
    const msg = res.choices[0].message;
    if (!msg.tool_calls?.length) return { reply: msg.content || '', impacts, change_id: changeId };
    messages.push(msg);
    for (const call of msg.tool_calls) {
      let out;
      try {
        const handler = handlers[call.function.name];
        out = handler ? await handler(storeId, JSON.parse(call.function.arguments || '{}')) : { result: { error: 'Unknown tool' } };
      } catch (e) {
        out = { result: { error: e.message } };
      }
      if (out.impacts) impacts.push(...out.impacts);
      if (out.change_id) changeId = out.change_id;
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(out.result) });
    }
  }
  throw new Error('Tool loop did not finish');
}
