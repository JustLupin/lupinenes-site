import { createHash } from 'node:crypto';
import { requireAdmin, fail, HttpError } from './_lib/auth.js';
import { putFile } from './_lib/github.js';

export const config = { api: { bodyParser: { sizeLimit: '5mb' } } };

const EXT = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif' };
const MAX_BYTES = 2_500_000;

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'POST only');

    const email = await requireAdmin(req);
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    const kind = String(body?.kind || '');
    if (!/^(avatar|banner|section)$/.test(kind)) throw new HttpError(400, 'unknown image kind');

    const m = /^data:(image\/(?:webp|png|jpeg|gif));base64,([A-Za-z0-9+/=]+)$/.exec(String(body?.dataUrl || ''));
    if (!m) throw new HttpError(400, 'expected a base64 image data url');

    const buf = Buffer.from(m[2], 'base64');
    if (!buf.length) throw new HttpError(400, 'image is empty');
    if (buf.length > MAX_BYTES) throw new HttpError(413, 'image is too large — keep it under 2.5 mb');

    /* Content-hashed so a replaced image can never be served from a stale cache. */
    const hash = createHash('sha256').update(buf).digest('hex').slice(0, 10);
    const name = `${kind}-${hash}.${EXT[m[1]]}`;

    await putFile(`public/uploads/${name}`, buf, `uploads: ${kind} via admin panel (${email})`);

    res.status(200).json({ ok: true, path: `/uploads/${name}` });
  } catch (err) {
    fail(res, err);
  }
}
