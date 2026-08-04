import { requireAdmin, fail, HttpError } from './_lib/auth.js';
import { putFile } from './_lib/github.js';
import { sanitize } from './_lib/content.js';

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'POST only');

    const email = await requireAdmin(req);

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const clean = sanitize(body?.content);

    const json = JSON.stringify(clean, null, 2) + '\n';
    if (json.length > 900_000) throw new HttpError(413, 'content is too large');

    await putFile('public/content.json', Buffer.from(json, 'utf8'), `content: update via admin panel (${email})`);

    res.status(200).json({
      ok: true,
      content: clean,
      note: 'committed — the live site updates once Vercel finishes redeploying (~40s)',
    });
  } catch (err) {
    fail(res, err);
  }
}
