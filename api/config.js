/* The OAuth client id is a public value — it ships in the sign-in button either
   way. Serving it here keeps the site a pure static bundle with no build step. */
export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'GET only' });
  res.setHeader('cache-control', 'public, max-age=300');
  res.status(200).json({ ok: true, googleClientId: process.env.GOOGLE_CLIENT_ID || '' });
}
