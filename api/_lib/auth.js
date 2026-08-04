import { createRemoteJWKSet, jwtVerify } from 'jose';
import { googleClientId } from './config.js';

/* Google's signing keys, cached and rotated by jose itself. */
const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function allowList() {
  return String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/* The export decided this in client-side JS, which anyone could edit. The whole
   point of moving saves to a server is that the check happens here instead. */
export async function requireAdmin(req) {
  /* Same source the sign-in button uses, so the audience check can never drift
     from the client that actually issued the token. */
  const clientId = googleClientId();
  if (!clientId) throw new HttpError(500, 'GOOGLE_CLIENT_ID is not configured');

  const allowed = allowList();
  if (!allowed.length) throw new HttpError(500, 'ADMIN_EMAILS is not configured');

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) throw new HttpError(401, 'not signed in');

  let payload;
  try {
    ({ payload } = await jwtVerify(token, JWKS, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: clientId,
      clockTolerance: 60,
    }));
  } catch {
    throw new HttpError(401, 'sign-in expired or invalid — sign in again');
  }

  if (payload.email_verified !== true) throw new HttpError(403, 'google account has no verified email');

  const email = String(payload.email || '').toLowerCase();
  if (!allowed.includes(email)) throw new HttpError(403, `${email} is not authorized`);

  return email;
}

export function fail(res, err) {
  const status = err instanceof HttpError ? err.status : 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ ok: false, error: err.message || 'server error' });
}
