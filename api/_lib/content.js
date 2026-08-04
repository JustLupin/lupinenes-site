import { HttpError } from './auth.js';

/* The browser sends whatever it likes. Everything that lands in the repo goes
   through here first, so a tampered request cannot inject markup, point an image
   at another origin, or commit a hundred-megabyte blob. */

const ICONS = new Set(['yt', 'ig', 'x', 'th', 'ln']);
const STATUS = new Set(['online', 'busy', 'dnd', 'offline']);

const LIMITS = {
  links: 24, logs: 16, rows: 80, sections: 24, langs: 8,
  username: 40, tagline: 140, bio: 4000, aboutLabel: 40,
  statusLabel: 40, note: 300, title: 60, lead: 300, tail: 300,
  name: 160, url: 500, body: 4000, id: 64,
};

const s = (v, max) => (typeof v === 'string' ? v : '').slice(0, max).trim();

const id = (v, fallback) => {
  const out = s(v, LIMITS.id).replace(/[^A-Za-z0-9_-]/g, '');
  return out || fallback;
};

const url = (v) => {
  const raw = s(v, LIMITS.url);
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw) || /^mailto:/i.test(raw)) return raw;
  return '';
};

/* Only paths this deployment itself wrote via /api/upload. */
const img = (v) => (typeof v === 'string' && /^\/uploads\/[A-Za-z0-9._-]{1,120}$/.test(v) ? v : null);

const arr = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);

function texts(t, shared) {
  t = t && typeof t === 'object' ? t : {};
  const sl = t.statusLabels && typeof t.statusLabels === 'object' ? t.statusLabels : {};
  const byId = (list) => {
    const m = new Map();
    for (const x of arr(list, 400)) if (x && typeof x === 'object') m.set(String(x.id), x);
    return m;
  };
  const tl = byId(t.links), tg = byId(t.logs), ts = byId(t.sections);

  return {
    username: s(t.username, LIMITS.username),
    tagline: s(t.tagline, LIMITS.tagline),
    bio: s(t.bio, LIMITS.bio),
    aboutLabel: s(t.aboutLabel, LIMITS.aboutLabel),
    statusLabels: {
      online: s(sl.online, LIMITS.statusLabel),
      busy: s(sl.busy, LIMITS.statusLabel),
      dnd: s(sl.dnd, LIMITS.statusLabel),
      offline: s(sl.offline, LIMITS.statusLabel),
    },
    links: shared.links.map((l) => ({ id: l.id, note: s(tl.get(l.id)?.note, LIMITS.note) })),
    logs: shared.logs.map((g) => {
      const m = tg.get(g.id);
      const rows = new Map();
      for (const r of arr(m?.rows, LIMITS.rows)) if (r && typeof r === 'object') rows.set(String(r.id), r);
      return {
        id: g.id,
        title: s(m?.title, LIMITS.title),
        lead: s(m?.lead, LIMITS.lead),
        tail: s(m?.tail, LIMITS.tail),
        rows: g.rows.map((r) => ({ id: r.id, note: s(rows.get(r.id)?.note, LIMITS.note) })),
      };
    }),
    sections: shared.sections.map((x) => ({
      id: x.id,
      title: s(ts.get(x.id)?.title, LIMITS.title),
      body: s(ts.get(x.id)?.body, LIMITS.body),
    })),
  };
}

export function sanitize(input) {
  if (!input || typeof input !== 'object') throw new HttpError(400, 'content must be an object');

  const out = {
    status: STATUS.has(input.status) ? input.status : 'online',
    discordId: /^[0-9]{5,25}$/.test(String(input.discordId || '')) ? String(input.discordId) : '',
    avatar: img(input.avatar),
    banner: img(input.banner),
    bgColor: /^#[0-9a-f]{6}$/i.test(String(input.bgColor || '')) ? String(input.bgColor).toLowerCase() : '#8c8c8c',
    bgScale: Math.min(2, Math.max(0.4, Number.isFinite(+input.bgScale) ? +input.bgScale : 1)),
    links: [],
    logs: [],
    sections: [],
    langs: [],
  };

  const seen = new Set();
  const uniq = (v, prefix, i) => {
    let key = id(v, `${prefix}${i}`);
    while (seen.has(key)) key = `${key}x`;
    seen.add(key);
    return key;
  };

  out.links = arr(input.links, LIMITS.links)
    .filter((l) => l && typeof l === 'object')
    .map((l, i) => ({
      id: uniq(l.id, 'l', i),
      icon: ICONS.has(l.icon) ? l.icon : 'ln',
      label: s(l.label, LIMITS.name),
      url: url(l.url),
    }));

  out.logs = arr(input.logs, LIMITS.logs)
    .filter((g) => g && typeof g === 'object')
    .map((g, i) => ({
      id: uniq(g.id, 'g', i),
      rows: arr(g.rows, LIMITS.rows)
        .filter((r) => r && typeof r === 'object')
        .map((r, j) => ({ id: uniq(r.id, `g${i}r`, j), name: s(r.name, LIMITS.name), url: url(r.url) }))
        .filter((r) => r.name),
    }));

  out.sections = arr(input.sections, LIMITS.sections)
    .filter((x) => x && typeof x === 'object')
    .map((x, i) => ({ id: uniq(x.id, 's', i), side: x.side === 'left' ? 'left' : 'right', image: img(x.image) }));

  const codes = new Set();
  out.langs = arr(input.langs, LIMITS.langs)
    .filter((L) => L && typeof L === 'object')
    .map((L, i) => {
      let code = s(L.code, 8).toLowerCase().replace(/[^a-z0-9-]/g, '') || (i === 0 ? 'en' : `lang${i + 1}`);
      while (codes.has(code)) code += 'x';
      codes.add(code);
      return { code, label: s(L.label, 6) || code.toUpperCase(), texts: texts(L.texts, out) };
    });

  if (!out.langs.length) {
    out.langs = [{ code: 'en', label: 'EN', texts: texts({ username: 'LupinEnes', aboutLabel: 'About' }, out) }];
  }
  return out;
}
