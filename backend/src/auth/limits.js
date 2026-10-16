// A small in-memory rate limiter (fixed window). Enough for one server; use a shared store if you run several.
const hits = new Map();

export function allow(key, max, windowMs) {
  const now = Date.now();
  let e = hits.get(key);
  if (!e || e.reset < now) {
    e = { n: 0, reset: now + windowMs };
    hits.set(key, e);
  }
  e.n += 1;
  return e.n <= max;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, e] of hits) if (e.reset < now) hits.delete(k);
}, 60_000).unref();

// Express middleware: at most `max` requests per window per key.
export const limit = (name, max, windowMs, keyOf = (req) => req.ip) => (req, res, next) => {
  if (allow(`${name}:${keyOf(req)}`, max, windowMs)) return next();
  res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' });
};

// A daily cap on paid AI calls (chat, voice in, voice out): AI_DAILY_CAP for the whole site (default 1000),
// AI_DAILY_CAP_PER_USER for one person (default 150). Resets at midnight UTC. In memory, so it restarts with the server.
const day = () => new Date().toISOString().slice(0, 10);
let site = { day: day(), n: 0 };
const perUser = new Map();

export const dailyAiCap = (req, res, next) => {
  const today = day();
  if (site.day !== today) {
    site = { day: today, n: 0 };
    perUser.clear();
  }
  const siteMax = Number(process.env.AI_DAILY_CAP) || 1000;
  const userMax = Number(process.env.AI_DAILY_CAP_PER_USER) || 150;
  const mine = perUser.get(req.user.id) ?? 0;
  if (site.n >= siteMax || mine >= userMax) {
    return res.status(429).json({ error: 'The AI has reached its daily limit. Please try again tomorrow.' });
  }
  site.n += 1;
  perUser.set(req.user.id, mine + 1);
  next();
};
