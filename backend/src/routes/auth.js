import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { query, transaction } from '../db.js';
import { DUMMY_HASH, hashPassword, verifyPassword } from '../auth/password.js';
import { endSession, startSession, userFromRequest } from '../auth/session.js';
import { allow, limit } from '../auth/limits.js';
import { authUrl, googleConfigured, identityFromCode } from '../auth/google.js';
import { createSampleStore } from '../sample.js';

export const authRouter = Router();

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const normEmail = (e) => String(e ?? '').trim().toLowerCase();
const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name });
const displayName = (u) => u.name || u.email.split('@')[0];

// A new account gets a store. The very first account takes over any stores nobody owns yet (the data from before
// logins existed); ADMIN_EMAIL, if set, restricts that to one address. Everyone else gets a fresh store.
async function giveStore(client, user, startWith) {
  await client.query('select pg_advisory_xact_lock(7001)'); // two first sign-ups at once must not both claim
  const admin = (process.env.ADMIN_EMAIL || '').trim().replace(/^["']|["']$/g, '').trim().toLowerCase(); // tolerate quotes around the value
  if (!admin || admin === user.email) {
    const claimed = await client.query(
      `insert into store_members (store_id, user_id, role)
       select s.id, $1, 'owner' from stores s where not exists (select 1 from store_members m where m.store_id = s.id)
       returning store_id`,
      [user.id],
    );
    if (claimed.rowCount > 0) return;
  }
  const name = `${displayName(user)}'s store`;
  const storeId = startWith === 'empty'
    ? (await client.query('insert into stores (name) values ($1) returning id', [name])).rows[0].id
    : await createSampleStore(client, name);
  await client.query(`insert into store_members (store_id, user_id, role) values ($1, $2, 'owner')`, [storeId, user.id]);
}

const ipLimit = limit('auth-ip', 120, 60_000);

authRouter.get('/config', (_req, res) => res.json({ google: googleConfigured() }));

authRouter.get('/me', async (req, res) => {
  const user = await userFromRequest(req);
  if (!user) return res.status(401).json({ error: 'Not logged in', code: 'login' });
  res.json({ user: publicUser(user) });
});

authRouter.post('/register', ipLimit, async (req, res) => {
  const email = normEmail(req.body.email);
  const password = String(req.body.password ?? '');
  const name = String(req.body.name ?? '').trim().slice(0, 60) || null;
  if (email.length > 254 || !EMAIL.test(email)) return res.status(400).json({ error: 'Enter a valid email address' });
  if (password.length < 8) return res.status(400).json({ error: 'Your password needs at least 8 characters' });
  if (password.length > 200) return res.status(400).json({ error: 'That password is too long' });
  const startWith = req.body.start_with === 'empty' ? 'empty' : 'sample';
  if ((await query('select 1 from users where email = $1', [email])).rowCount) {
    return res.status(409).json({ error: 'That email is already registered. Log in instead.' });
  }
  const hash = await hashPassword(password);
  let user;
  try {
    user = await transaction(async (client) => {
      const u = (await client.query('insert into users (email, name, password_hash) values ($1, $2, $3) returning id, email, name', [email, name, hash])).rows[0];
      await giveStore(client, u, startWith);
      return u;
    });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'That email is already registered. Log in instead.' });
    throw err;
  }
  await startSession(req, res, user.id);
  res.status(201).json({ user: publicUser(user) });
});

authRouter.post('/login', ipLimit, async (req, res) => {
  const email = normEmail(req.body.email);
  const password = String(req.body.password ?? '');
  if (!allow(`login:${email}`, 10, 15 * 60_000)) return res.status(429).json({ error: 'Too many attempts for this email. Please wait 15 minutes and try again.' });
  const user = (await query('select id, email, name, password_hash from users where email = $1', [email])).rows[0];
  const ok = await verifyPassword(password.slice(0, 200), user?.password_hash ?? DUMMY_HASH); // same work whether or not the email exists
  if (!user || !user.password_hash || !ok) return res.status(401).json({ error: 'Wrong email or password' });
  await query('update users set last_login_at = now() where id = $1', [user.id]);
  await startSession(req, res, user.id);
  res.json({ user: publicUser(user) });
});

authRouter.post('/logout', async (req, res) => {
  await endSession(req, res);
  res.json({ ok: true });
});

// ---- Continue with Google ----
const OAUTH_COOKIE = 'kumtun_oauth';
const oauthCookie = (req) => ({ httpOnly: true, sameSite: 'lax', secure: req.secure, path: '/api/auth/google', maxAge: 10 * 60 * 1000 });
const failTo = (res, why) => res.redirect(`/?login_error=${why}`);

authRouter.get('/google', ipLimit, (req, res) => {
  if (!googleConfigured()) return failTo(res, 'google_off');
  const state = randomBytes(16).toString('base64url');
  const start = req.query.start === 'empty' ? 'empty' : 'sample';
  res.cookie(OAUTH_COOKIE, Buffer.from(JSON.stringify({ state, start })).toString('base64url'), oauthCookie(req));
  res.redirect(authUrl(req, state));
});

authRouter.get('/google/callback', ipLimit, async (req, res) => {
  let saved = null;
  try {
    const raw = (req.headers.cookie || '').split(';').map((c) => c.trim()).find((c) => c.startsWith(`${OAUTH_COOKIE}=`));
    saved = raw ? JSON.parse(Buffer.from(raw.slice(OAUTH_COOKIE.length + 1), 'base64url').toString('utf8')) : null;
  } catch {
    saved = null;
  }
  res.clearCookie(OAUTH_COOKIE, { path: '/api/auth/google' });
  if (req.query.error) return failTo(res, 'google_denied');
  // the state we set before sending the person to Google must come back unchanged (stops forged callbacks)
  if (!saved || !req.query.state || req.query.state !== saved.state || !req.query.code) return failTo(res, 'google_failed');
  let who;
  try {
    who = await identityFromCode(req, String(req.query.code));
  } catch (err) {
    console.error('Google sign-in failed:', err.message);
    return failTo(res, 'google_failed');
  }
  const user = await transaction(async (client) => {
    let u = (await client.query('select id, email, name, google_sub from users where google_sub = $1', [who.sub])).rows[0]
      ?? (await client.query('select id, email, name, google_sub from users where email = $1', [who.email])).rows[0];
    if (u && !u.google_sub) {
      // Google has verified this email, so the real owner is signing in. Anyone who registered the address earlier with
      // a password of their own (nobody checks emails at sign-up) loses that password and every login session.
      await client.query('update users set password_hash = null where id = $1', [u.id]);
      await client.query('delete from sessions where user_id = $1', [u.id]);
    }
    if (u) {
      await client.query('update users set google_sub = $2, name = coalesce(name, $3), last_login_at = now() where id = $1', [u.id, who.sub, who.name]);
      return u;
    }
    u = (await client.query('insert into users (email, name, google_sub) values ($1, $2, $3) returning id, email, name', [who.email, who.name, who.sub])).rows[0];
    await giveStore(client, u, saved.start);
    return u;
  });
  await startSession(req, res, user.id);
  res.redirect('/');
});
