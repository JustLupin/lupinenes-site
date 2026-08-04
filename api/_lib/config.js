/* The OAuth client id is a public value — it is embedded in the sign-in button and
   visible to anyone who opens devtools, so it lives in the repo rather than in
   configuration. Keeping it here means a fresh deploy works without setting
   anything up first.

   GOOGLE_CLIENT_ID still wins if it is set, so the client can be swapped without a
   commit — but note that a stale env var will silently override this value. */
const DEFAULT_GOOGLE_CLIENT_ID = '824586176582-5i6nn23553gj8cds3qt7qkb2e59a56f5.apps.googleusercontent.com';

const fromEnv = () => String(process.env.GOOGLE_CLIENT_ID || '').trim();

export function googleClientId() {
  return fromEnv() || DEFAULT_GOOGLE_CLIENT_ID;
}

/* Reported by /api/config purely so "why is it still using the old client?" is a
   one-request question to answer. */
export function googleClientIdSource() {
  return fromEnv() ? 'env' : 'built-in';
}
