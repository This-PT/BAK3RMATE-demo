import { createHash, randomBytes } from 'node:crypto';
import { query } from '../db.js';

export const COOKIE = 'kumtun_session';
const DAYS = 30;
const sha = (t) => createHash('sha256').update(t).digest('hex');

function tokenFrom(req) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === COOKIE) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

const cookieOptions = (req) => ({ httpOnly: true, sameSite: 'lax', secure: req.secure, path: '/', maxAge: DAYS * 24 * 3600 * 1000 });

// The browser gets a random token in an httpOnly cookie; the database only keeps its hash.
export async function startSession(req, res, userId) {
  const token = randomBytes(32).toString('base64url');
  await query(`insert into sessions (token_hash, user_id, expires_at) values ($1, $2, now() + ($3 || ' days')::interval)`, [sha(token), userId, String(DAYS)]);
  res.cookie(COOKIE, token, cookieOptions(req));
}

export async function endSession(req, res) {
  const token = tokenFrom(req);
  if (token) await query('delete from sessions where token_hash = $1', [sha(token)]);
  res.clearCookie(COOKIE, { path: '/', httpOnly: true, sameSite: 'lax', secure: req.secure });
}

// Returns { id, email, name } for a valid session, otherwise null. Active sessions are extended.
export async function userFromRequest(req) {
  const token = tokenFrom(req);
  if (!token) return null;
  const { rows } = await query(
    `select u.id, u.email, u.name, s.expires_at from sessions s join users u on u.id = s.user_id
      where s.token_hash = $1 and s.expires_at > now()`,
    [sha(token)],
  );
  const row = rows[0];
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now() + (DAYS - 1) * 24 * 3600 * 1000) {
    await query(`update sessions set expires_at = now() + ($2 || ' days')::interval where token_hash = $1`, [sha(token), String(DAYS)]);
  }
  return { id: row.id, email: row.email, name: row.name };
}
