// "Continue with Google": the standard OAuth 2.0 authorization-code flow, done on the server (no extra libraries).
// Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET from Google Cloud Console (see README), and the redirect address
//   <PUBLIC_URL>/api/auth/google/callback
// added to the OAuth client's "Authorized redirect URIs".
export const googleConfigured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export function redirectUri(req) {
  const base = (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  return `${base}/api/auth/google/callback`;
}

export function authUrl(req, state) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(req),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

// Checks what Google says about the person. Pure, so it can be tested without Google.
export function checkClaims(claims, clientId, nowMs = Date.now()) {
  if (!claims || typeof claims !== 'object') throw new Error('No identity from Google');
  if (claims.aud !== clientId) throw new Error('The sign-in was meant for a different app');
  if (claims.iss !== 'https://accounts.google.com' && claims.iss !== 'accounts.google.com') throw new Error('Unexpected sign-in issuer');
  if (!claims.exp || claims.exp * 1000 < nowMs) throw new Error('The sign-in expired');
  if (!claims.sub || !claims.email) throw new Error('Google did not share an email address');
  if (claims.email_verified !== true) throw new Error('That Google email is not verified');
  return { sub: String(claims.sub), email: String(claims.email).toLowerCase(), name: claims.name ? String(claims.name).slice(0, 60) : null };
}

// Swaps the one-time code for the person's identity. The ID token comes straight from Google over HTTPS,
// so, as Google documents, its contents can be trusted without checking the signature again.
export async function identityFromCode(req, code) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri(req),
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    // Google's own reason (e.g. invalid_client, redirect_uri_mismatch) goes to the server log only, never to the browser
    let why = '';
    try {
      const j = await res.json();
      why = ` ${j.error ?? ''}${j.error_description ? `: ${j.error_description}` : ''}`;
    } catch {
      /* no details */
    }
    throw new Error(`Google refused the sign-in (${res.status}).${why}`);
  }
  const { id_token: idToken } = await res.json();
  if (!idToken) throw new Error('Google sent no identity');
  const claims = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8'));
  return checkClaims(claims, process.env.GOOGLE_CLIENT_ID);
}
