import { userFromRequest } from './session.js';

export async function requireAuth(req, res, next) {
  const user = await userFromRequest(req);
  if (!user) return res.status(401).json({ error: 'Please log in', code: 'login' });
  req.user = user;
  next();
}

// Cookies are SameSite=Lax already; this also refuses state-changing requests that come from another website.
export function originCheck(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin) {
    let host = null;
    try {
      host = new URL(origin).host;
    } catch {
      /* malformed origin */
    }
    if (host !== req.get('host')) return res.status(403).json({ error: 'Request blocked: it came from another site' });
  }
  next();
}
