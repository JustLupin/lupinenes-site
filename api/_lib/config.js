/* Single source for the OAuth client id, read by both the sign-in button (via
   /api/config) and the server-side audience check. They must never disagree — if
   they do, every sign-in fails the audience check with an error that points
   nowhere near the cause. */
export function googleClientId() {
  return String(process.env.GOOGLE_CLIENT_ID || '').trim();
}
