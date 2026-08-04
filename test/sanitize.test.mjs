import { sanitize } from '../api/_lib/content.js';

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
};

// javascript: and data: URLs must not survive into the repo
const x1 = sanitize({ links: [{ id: 'a', label: 'x', url: 'javascript:alert(1)' }] });
check('javascript: url stripped', x1.links[0].url, '');

const x2 = sanitize({ links: [{ id: 'a', label: 'x', url: 'data:text/html,<script>' }] });
check('data: url stripped', x2.links[0].url, '');

const x3 = sanitize({ links: [{ id: 'a', label: 'x', url: 'https://ok.example/p' }] });
check('https url kept', x3.links[0].url, 'https://ok.example/p');

// images may only ever point at our own uploads
check('remote avatar rejected', sanitize({ avatar: 'https://evil.example/a.png' }).avatar, null);
check('traversal avatar rejected', sanitize({ avatar: '/uploads/../../etc/passwd' }).avatar, null);
check('data-url avatar rejected server-side', sanitize({ avatar: 'data:image/png;base64,AAAA' }).avatar, null);
check('valid upload kept', sanitize({ avatar: '/uploads/avatar-abc123.webp' }).avatar, '/uploads/avatar-abc123.webp');

// bounds
const huge = sanitize({ links: Array.from({ length: 500 }, (_, i) => ({ id: 'l' + i, label: 'x', url: 'https://a.b' })) });
check('link count capped at 24', huge.links.length, 24);

const longBio = sanitize({ langs: [{ code: 'en', texts: { bio: 'z'.repeat(99999) } }] });
check('bio truncated to 4000', longBio.langs[0].texts.bio.length, 4000);

// ids are sanitised but preserved so translations stay attached
const ids = sanitize({
  links: [{ id: 'l1"><img src=x>', label: 'a', url: 'https://a.b' }],
  langs: [{ code: 'en', texts: { links: [{ id: 'l1imgsrcx', note: 'hi' }] } }],
});
check('id stripped to safe chars', ids.links[0].id, 'l1imgsrcx');
check('translation still matched by id', ids.langs[0].texts.links[0].note, 'hi');

// duplicate ids must not collide (they key the translations)
const dup = sanitize({ links: [{ id: 'same', label: 'a', url: '' }, { id: 'same', label: 'b', url: '' }] });
check('duplicate ids disambiguated', dup.links.map(l => l.id), ['same', 'samex']);

// enum fields
check('bad status falls back', sanitize({ status: 'wat' }).status, 'online');
check('bad icon falls back', sanitize({ links: [{ id: 'a', label: 'a', url: '' }] }).links[0].icon, 'ln');
check('bad discordId dropped', sanitize({ discordId: 'abc' }).discordId, '');
check('good discordId kept', sanitize({ discordId: '983802898041425920' }).discordId, '983802898041425920');
check('bgScale clamped', sanitize({ bgScale: 99 }).bgScale, 2);
check('bgColor validated', sanitize({ bgColor: 'red' }).bgColor, '#8c8c8c');

// structural junk must not throw
check('null langs -> default', sanitize({ langs: null }).langs.length, 1);
check('rows without a name dropped', sanitize({ logs: [{ id: 'g', rows: [{ id: 'r', name: '' }] }] }).logs[0].rows.length, 0);
check('non-object entries skipped', sanitize({ links: [null, 'x', 5] }).links.length, 0);

let threw = false;
try { sanitize(null); } catch { threw = true; }
check('null input rejected', threw, true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

