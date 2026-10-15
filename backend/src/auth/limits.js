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
