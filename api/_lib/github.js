import { HttpError } from './auth.js';

const API = 'https://api.github.com';

function conf() {
  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;
  const branch = process.env.GITHUB_BRANCH || 'main';
  if (!repo) throw new HttpError(500, 'GITHUB_REPO is not configured');
  if (!token) throw new HttpError(500, 'GITHUB_TOKEN is not configured');
  return { repo, token, branch };
}

async function gh(path, init = {}) {
  const { token } = conf();
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
      'user-agent': 'lupinenes-site',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  return res;
}

/* Returns the blob sha so the next write can be conditional, or null if absent. */
export async function fileSha(path) {
  const { repo, branch } = conf();
  const res = await gh(`/repos/${repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(branch)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new HttpError(502, `github read failed (${res.status})`);
  const json = await res.json();
  return json.sha || null;
}

/* Commits a file. The sha makes the write conditional, so two admins saving at the
   same moment produce a 409 rather than one silently overwriting the other. */
export async function putFile(path, buffer, message) {
  const { repo, branch } = conf();

  const write = async (sha) => {
    const res = await gh(`/repos/${repo}/contents/${encodeURI(path)}`, {
      method: 'PUT',
      body: JSON.stringify({
        message,
        content: Buffer.from(buffer).toString('base64'),
        branch,
        ...(sha ? { sha } : {}),
      }),
    });
    return res;
  };

  let res = await write(await fileSha(path));

  /* One retry against a fresh sha covers the ordinary "saved twice quickly" race. */
  if (res.status === 409 || res.status === 422) {
    res = await write(await fileSha(path));
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (res.status === 401 || res.status === 403) {
      throw new HttpError(502, 'github rejected the token — check GITHUB_TOKEN scope and expiry');
    }
    throw new HttpError(502, `github write failed (${res.status}) ${body.slice(0, 200)}`);
  }
  return res.json();
}
