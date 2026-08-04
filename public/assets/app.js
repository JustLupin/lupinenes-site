/* LupinEnes — public site.
   Content comes from /content.json (committed in the repo by the admin panel).
   Live presence comes from Lanyard; state.status is only the fallback. */
(function () {
'use strict';

var LANG_KEY = 'lupinenes.lang.v1';
var DEFAULT_AVATAR = '/uploads/avatar.webp';
var ICONS = { yt: 1, ig: 1, x: 1, th: 1, ln: 1 };
var STATUS_KEYS = { online: 1, busy: 1, dnd: 1, offline: 1 };
var FX_MIN = 0.4, FX_MAX = 2;
var uidC = 0;

function uid(p) { return (p || 'id') + '-' + Date.now().toString(36) + '-' + (++uidC).toString(36); }
function $(id) { return document.getElementById(id); }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function pad(n) { return (n < 10 ? '0' : '') + n; }
function slug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'box'; }
function initials(name) {
  var p = String(name || '').trim().split(/\s+/);
  var out = (p[0] ? p[0].charAt(0) : '') + (p[1] ? p[1].charAt(0) : '');
  return (out || 'L').toUpperCase();
}
function str(v) { return typeof v === 'string' ? v : (v == null ? '' : String(v)); }
function pick(a, fallback) { return (typeof a === 'string' && a !== '') ? a : (fallback || ''); }
function findIn(arr, id) {
  for (var i = 0; i < (arr || []).length; i++) { if (arr[i].id === id) return arr[i]; }
  return null;
}
function toastText(msg, bad) {
  var t = $('toast');
  t.textContent = msg;
  t.classList.toggle('bad', !!bad);
  t.classList.add('show');
  clearTimeout(toastText.timer);
  toastText.timer = setTimeout(function () { t.classList.remove('show'); }, 2800);
}

/* An image is either an uploaded repo path or a data: URL held in the admin panel
   before it has been uploaded. Anything else is rejected so a hostile content.json
   cannot inject a URL into a style or src. */
function imgVal(v) {
  if (typeof v !== 'string') return null;
  if (/^\/uploads\/[A-Za-z0-9._-]+$/.test(v)) return v;
  if (v.indexOf('data:image/') === 0) return v;
  return null;
}
function safeUrl(v) {
  var s = str(v).trim();
  if (!s) return '';
  if (/^(https?:|mailto:|\/(?!\/))/i.test(s)) return s;
  return '';
}

function normTexts(t, shared) {
  t = (t && typeof t === 'object') ? t : {};
  var o = {
    username: str(t.username), tagline: str(t.tagline), bio: str(t.bio),
    aboutLabel: str(t.aboutLabel),
    statusLabels: { online: '', busy: '', dnd: '', offline: '' },
    links: [], logs: [], sections: []
  };
  var sl = (t.statusLabels && typeof t.statusLabels === 'object') ? t.statusLabels : {};
  ['online', 'busy', 'dnd', 'offline'].forEach(function (k) { o.statusLabels[k] = str(sl[k]); });

  var tl = Array.isArray(t.links) ? t.links : [];
  (shared.links || []).forEach(function (l) {
    var m = findIn(tl, l.id);
    o.links.push({ id: l.id, note: m ? str(m.note) : '' });
  });
  var tg = Array.isArray(t.logs) ? t.logs : [];
  (shared.logs || []).forEach(function (g) {
    var m = findIn(tg, g.id);
    var rows = [];
    (g.rows || []).forEach(function (r) {
      var rm = m && Array.isArray(m.rows) ? findIn(m.rows, r.id) : null;
      rows.push({ id: r.id, note: rm ? str(rm.note) : '' });
    });
    o.logs.push({
      id: g.id, title: m ? str(m.title) : '', lead: m ? str(m.lead) : '',
      tail: m ? str(m.tail) : '', rows: rows
    });
  });
  var ts = Array.isArray(t.sections) ? t.sections : [];
  (shared.sections || []).forEach(function (s) {
    var m = findIn(ts, s.id);
    o.sections.push({ id: s.id, title: m ? str(m.title) : '', body: m ? str(m.body) : '' });
  });
  return o;
}

function normalize(d) {
  d = (d && typeof d === 'object') ? d : {};
  var s = {
    status: STATUS_KEYS[d.status] ? d.status : 'online',
    discordId: /^[0-9]{5,25}$/.test(str(d.discordId)) ? str(d.discordId) : '',
    avatar: imgVal(d.avatar),
    banner: imgVal(d.banner),
    bgColor: /^#[0-9a-f]{6}$/i.test(str(d.bgColor)) ? str(d.bgColor).toLowerCase() : '#8c8c8c',
    bgScale: 1,
    links: [], logs: [], sections: [], langs: []
  };
  var bs = parseFloat(d.bgScale);
  s.bgScale = Math.min(FX_MAX, Math.max(FX_MIN, isNaN(bs) ? 1 : bs));

  s.links = (Array.isArray(d.links) ? d.links : []).map(function (l) {
    l = (l && typeof l === 'object') ? l : {};
    return { id: str(l.id) || uid('l'), icon: ICONS[l.icon] ? l.icon : 'ln', label: str(l.label), url: safeUrl(l.url) };
  });
  s.logs = (Array.isArray(d.logs) ? d.logs : []).map(function (g) {
    g = (g && typeof g === 'object') ? g : {};
    return {
      id: str(g.id) || uid('g'),
      rows: (Array.isArray(g.rows) ? g.rows : []).map(function (r) {
        r = (r && typeof r === 'object') ? r : {};
        return { id: str(r.id) || uid('r'), name: str(r.name), url: safeUrl(r.url) };
      })
    };
  });
  s.sections = (Array.isArray(d.sections) ? d.sections : []).map(function (x) {
    x = (x && typeof x === 'object') ? x : {};
    return { id: str(x.id) || uid('s'), side: x.side === 'left' ? 'left' : 'right', image: imgVal(x.image) };
  });

  s.langs = (Array.isArray(d.langs) ? d.langs : []).map(function (L) {
    L = (L && typeof L === 'object') ? L : {};
    return { code: str(L.code).toLowerCase(), label: str(L.label), texts: normTexts(L.texts, s) };
  }).filter(function (L) { return L.code; });
  if (!s.langs.length) {
    s.langs = [{ code: 'en', label: 'EN', texts: normTexts({ username: 'LupinEnes', aboutLabel: 'About' }, s) }];
  }
  return s;
}

var state = normalize({});
var live = null;                 /* live presence from Lanyard, or null */

function langIdx() {
  var code = '';
  try { code = localStorage.getItem(LANG_KEY) || ''; } catch (e) {}
  for (var i = 0; i < state.langs.length; i++) { if (state.langs[i].code === code) return i; }
  return 0;
}
function setLang(code) {
  try { localStorage.setItem(LANG_KEY, code); } catch (e) {}
  render();
}
function textPair(field, id) {
  var T = state.langs[langIdx()].texts, T0 = state.langs[0].texts;
  return { cur: findIn(T[field], id), def: findIn(T0[field], id) };
}
function effectiveStatus() {
  if (live && STATUS_KEYS[live.status]) return live.status;
  return STATUS_KEYS[state.status] ? state.status : 'online';
}

function render() {
  var st = effectiveStatus();
  var li = langIdx();
  var T = state.langs[li].texts, T0 = state.langs[0].texts;
  document.body.dataset.status = st;

  var username = pick(T.username, T0.username) || 'LupinEnes';
  var statusWord = pick(T.statusLabels[st], T0.statusLabels[st]) || st;
  $('bar-prompt').textContent = username.toLowerCase().replace(/\s+/g, '') + '@home';
  $('bar-status').textContent = statusWord;
  document.title = username + ' — home';
  document.documentElement.lang = state.langs[li].code || 'en';
  $('name').textContent = username;
  $('tagline').textContent = pick(T.tagline, T0.tagline);
  $('presence').title = statusWord;

  var sw = $('lang-switch');
  if (state.langs.length < 2) {
    sw.hidden = true;
  } else {
    sw.hidden = false;
    sw.innerHTML = '';
    state.langs.forEach(function (L, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = L.label || L.code;
      b.setAttribute('aria-pressed', i === li ? 'true' : 'false');
      b.addEventListener('click', function () { setLang(L.code); });
      sw.appendChild(b);
    });
  }

  var fb = $('avatar-fallback');
  var img = $('avatar-img');
  fb.textContent = initials(username);
  fb.hidden = true;
  img.onerror = function () { fb.hidden = false; img.hidden = true; };
  img.hidden = false;
  img.src = state.avatar || DEFAULT_AVATAR;

  var banner = $('banner');
  if (state.banner) {
    banner.style.backgroundImage = 'url("' + state.banner + '")';
    banner.style.backgroundSize = 'cover';
    banner.style.backgroundPosition = 'center';
  } else {
    banner.style.backgroundImage = '';
    banner.style.backgroundSize = '';
    banner.style.backgroundPosition = '';
  }

  $('about-label').textContent = pick(T.aboutLabel, T0.aboutLabel) || 'About';
  $('about-text').textContent = pick(T.bio, T0.bio);

  $('sections-wrap').innerHTML = state.sections.map(function (sec, si) {
    var p = textPair('sections', sec.id), t = p.cur, d = p.def;
    var title = pick(t && t.title, d && d.title);
    var body = pick(t && t.body, d && d.body);
    if (!title && !body && !sec.image) return '';
    var media = sec.image
      ? '<div class="xmedia"><img src="' + esc(sec.image) + '" loading="lazy" alt="' + esc(title || 'section image') + '"></div>'
      : '';
    var text = '<div class="xtext">'
      + (title ? '<span class="alabel">' + esc(title) + '</span>' : '')
      + (body ? '<p class="atext">' + esc(body) + '</p>' : '')
      + '</div>';
    return '<section class="xsec' + (sec.side === 'left' ? ' flip' : '') + '" data-od-id="section-' + slug(title || ('box-' + si)) + '">'
      + '<div class="xbody">' + text + media + '</div></section>';
  }).join('');

  $('log-grid').innerHTML = state.logs.map(function (log, gi) {
    var p = textPair('logs', log.id), t = p.cur, d = p.def;
    var title = pick(t && t.title, d && d.title);
    var lead = pick(t && t.lead, d && d.lead);
    var tail = pick(t && t.tail, d && d.tail);
    var rows = (log.rows || []).map(function (r, i) {
      var tr = findIn(t && t.rows, r.id), dr = findIn(d && d.rows, r.id);
      var note = pick(tr && tr.note, dr && dr.note);
      var inner = r.url
        ? '<a href="' + esc(r.url) + '" target="_blank" rel="noopener noreferrer">' + esc(r.name) + '</a>'
        : esc(r.name);
      if (note) inner += '<span class="nt">' + esc(note) + '</span>';
      return '<div class="row"><span class="ix">' + pad(i + 1) + '</span><p class="ttl">' + inner + '</p></div>';
    }).join('');
    var m = String(title || '').match(/^(.*?)(\.[a-z0-9]+)$/i);
    var fn = m ? esc(m[1]) + '<em>' + esc(m[2]) + '</em>' : esc(title || 'untitled');
    return '<section class="panel" data-od-id="panel-' + slug(title || ('box-' + gi)) + '">'
      + '<div class="phead"><span class="fn">' + fn + '</span><span class="count">' + pad((log.rows || []).length) + '</span></div>'
      + (lead ? '<p class="lead">' + esc(lead) + '</p>' : '')
      + rows
      + (tail ? '<p class="tail">' + esc(tail) + '</p>' : '')
      + '</section>';
  }).join('');

  $('socials-chips').innerHTML = state.links.map(function (l) {
    var p = textPair('links', l.id), t = p.cur, d = p.def;
    var note = pick(t && t.note, d && d.note);
    var svg = (l.icon && ICONS[l.icon]) ? '<svg aria-hidden="true"><use href="#i-' + esc(l.icon) + '"/></svg>' : '';
    return '<a class="chip" href="' + esc(l.url || '#') + '" target="_blank" rel="noopener noreferrer"'
      + (note ? ' title="' + esc(note) + '"' : '') + '>' + svg + '<span>' + esc(l.label || l.url) + '</span></a>';
  }).join('');

  renderNow();
  applyFx();
}

/* ---- live activity (Lanyard) ---------------------------------------------- */

var ACT_VERB = { 0: 'playing', 1: 'streaming', 2: 'listening to', 3: 'watching', 5: 'competing in' };

function renderNow() {
  var now = $('now'), bar = $('bar-act');
  var art = $('now-art'), label = $('now-label'), main = $('now-main'), sub = $('now-sub');

  if (!live) { now.hidden = true; bar.hidden = true; return; }

  if (live.spotify) {
    now.hidden = false;
    label.textContent = 'now playing';
    main.textContent = live.spotify.song || '';
    sub.textContent = [live.spotify.artist, live.spotify.album].filter(Boolean).join(' · ');
    if (live.spotify.art) {
      art.onerror = function () { art.hidden = true; };
      art.src = live.spotify.art;
      art.hidden = false;
    } else { art.hidden = true; }
    bar.hidden = false;
    bar.innerHTML = '· <b>' + esc(live.spotify.song || '') + '</b>';
    return;
  }

  var a = live.activity;
  if (a) {
    now.hidden = false;
    art.hidden = true;
    label.textContent = ACT_VERB[a.type] || 'doing';
    main.textContent = a.name || '';
    sub.textContent = [a.details, a.state].filter(Boolean).join(' · ');
    bar.hidden = false;
    bar.innerHTML = '· ' + esc(ACT_VERB[a.type] || '') + ' <b>' + esc(a.name || '') + '</b>';
    return;
  }
  now.hidden = true;
  bar.hidden = true;
}

/* Discord exposes presence over the gateway only, so this rides Lanyard's socket.
   idle maps onto the design's "busy" slot — those are the same state. */
function startPresence(userId) {
  if (!userId) return;
  var MAP = { online: 'online', idle: 'busy', dnd: 'dnd', offline: 'offline' };
  var ws = null, beat = null, retry = 0, pollTimer = null, dead = false;

  function apply(d) {
    if (!d) return;
    var spotify = null;
    if (d.listening_to_spotify && d.spotify) {
      spotify = {
        song: str(d.spotify.song), artist: str(d.spotify.artist),
        album: str(d.spotify.album),
        art: /^https:\/\/i\.scdn\.co\//.test(str(d.spotify.album_art_url)) ? d.spotify.album_art_url : ''
      };
    }
    var activity = null;
    var list = Array.isArray(d.activities) ? d.activities : [];
    for (var i = 0; i < list.length; i++) {
      /* type 4 is the custom status line, not something he is doing */
      if (list[i] && list[i].type !== 4 && !(d.listening_to_spotify && list[i].type === 2)) {
        activity = { type: list[i].type, name: str(list[i].name), details: str(list[i].details), state: str(list[i].state) };
        break;
      }
    }
    live = { status: MAP[d.discord_status] || 'offline', spotify: spotify, activity: activity };
    render();
  }

  function poll() {
    fetch('https://api.lanyard.rest/v1/users/' + encodeURIComponent(userId))
      .then(function (r) { return r.json(); })
      .then(function (j) { if (j && j.success && j.data) apply(j.data); })
      .catch(function () {});
  }

  function stopPoll() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }
  function startPoll() { if (!pollTimer) { poll(); pollTimer = setInterval(poll, 60000); } }

  function connect() {
    if (dead) return;
    try { ws = new WebSocket('wss://api.lanyard.rest/socket?v=1&encoding=json'); }
    catch (e) { startPoll(); return; }

    ws.onopen = function () { retry = 0; };
    ws.onmessage = function (ev) {
      var m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.op === 1) {
        stopPoll();
        ws.send(JSON.stringify({ op: 2, d: { subscribe_to_id: String(userId) } }));
        clearInterval(beat);
        beat = setInterval(function () {
          if (ws && ws.readyState === 1) ws.send(JSON.stringify({ op: 3 }));
        }, (m.d && m.d.heartbeat_interval) || 30000);
      } else if (m.op === 0 && (m.t === 'INIT_STATE' || m.t === 'PRESENCE_UPDATE')) {
        apply(m.d);
      }
    };
    ws.onclose = function () {
      clearInterval(beat);
      if (dead) return;
      startPoll();                                   /* keep it accurate while reconnecting */
      retry++;
      setTimeout(connect, Math.min(30000, 1000 * Math.pow(2, Math.min(retry, 5))));
    };
    ws.onerror = function () { try { ws.close(); } catch (e) {} };
  }

  /* Don't hold a socket open for a tab nobody is looking at. */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      dead = true;
      clearInterval(beat); stopPoll();
      try { if (ws) ws.close(); } catch (e) {}
    } else if (dead) {
      dead = false; retry = 0; connect();
    }
  });

  connect();
}

/* ---- drifting background -------------------------------------------------- */
/* The export spawned many small 2–11px dots, which read as dust or a rendering
   artifact rather than as intentional motion. Fewer, larger and softer circles
   read as depth. */

var fx = { canvas: null, ctx: null, w: 0, h: 0, parts: [], rgb: [140, 140, 140], scale: 1, raf: 0, reduced: false };

function hexToRgb(hex) {
  var m = /^#([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return null;
  var n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function clamp8(v) { return Math.max(0, Math.min(255, Math.round(v))); }
function fxTint(p) {
  p.fill = 'rgba(' + clamp8(fx.rgb[0] + p.co[0]) + ',' + clamp8(fx.rgb[1] + p.co[1]) + ',' + clamp8(fx.rgb[2] + p.co[2]) + ',' + p.a + ')';
}
function fxSpawn(p, anywhere) {
  p.br = 14 + Math.random() * 32;
  p.r = p.br * fx.scale;
  p.x = anywhere ? Math.random() * fx.w : -p.r - Math.random() * 120;
  p.y = Math.random() * fx.h;
  p.vx = 0.10 + Math.random() * 0.26;
  p.vy = (Math.random() < 0.5 ? -1 : 1) * (0.03 + Math.random() * 0.09);
  p.a = Math.round((0.05 + Math.random() * 0.09) * 100) / 100;
  p.co = [
    Math.round((Math.random() * 2 - 1) * 18),
    Math.round((Math.random() * 2 - 1) * 18),
    Math.round((Math.random() * 2 - 1) * 18)
  ];
  fxTint(p);
}
function fxResize() {
  if (!fx.canvas) return;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  fx.w = window.innerWidth;
  fx.h = window.innerHeight;
  fx.canvas.width = Math.round(fx.w * dpr);
  fx.canvas.height = Math.round(fx.h * dpr);
  fx.canvas.style.width = fx.w + 'px';
  fx.canvas.style.height = fx.h + 'px';
  fx.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  var want = Math.max(7, Math.min(22, Math.round((fx.w * fx.h) / 74000)));
  while (fx.parts.length > want) fx.parts.pop();
  while (fx.parts.length < want) { var p = {}; fxSpawn(p, true); fx.parts.push(p); }
}
function fxDraw(advance) {
  var c = fx.ctx;
  c.clearRect(0, 0, fx.w, fx.h);
  for (var i = 0; i < fx.parts.length; i++) {
    var p = fx.parts[i];
    if (advance) {
      p.x += p.vx; p.y += p.vy;
      if (p.x - p.r > fx.w || p.y < -p.r * 2 || p.y > fx.h + p.r * 2) fxSpawn(p, false);
    }
    c.beginPath();
    c.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    c.fillStyle = p.fill;
    c.fill();
  }
}
function fxFrame() {
  fxDraw(true);
  fx.raf = requestAnimationFrame(fxFrame);
}
function applyFx() {
  if (!fx.ctx) return;
  fx.rgb = hexToRgb(state.bgColor) || [140, 140, 140];
  var next = Math.min(FX_MAX, Math.max(FX_MIN, parseFloat(state.bgScale) || 1));
  var changed = next !== fx.scale;
  fx.scale = next;
  fx.parts.forEach(function (p) {
    if (changed) p.r = p.br * fx.scale;
    fxTint(p);
  });
  if (fx.reduced) fxDraw(false);
}
function initFx() {
  fx.canvas = $('bg-fx');
  if (!fx.canvas || !fx.canvas.getContext) return;
  fx.ctx = fx.canvas.getContext('2d');
  fx.reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  fxResize();
  applyFx();
  window.addEventListener('resize', function () { fxResize(); if (fx.reduced) fxDraw(false); });
  /* reduced motion still gets the texture, just held still */
  if (fx.reduced) fxDraw(false);
  else fx.raf = requestAnimationFrame(fxFrame);
}

/* ---- copy url ------------------------------------------------------------- */

(function () {
  var btn = document.querySelector('.copy');
  if (!btn) return;
  var original = btn.textContent;
  btn.addEventListener('click', function () {
    var url = location.href;
    function done() {
      btn.textContent = 'copied';
      btn.classList.add('did');
      setTimeout(function () { btn.textContent = original; btn.classList.remove('did'); }, 1400);
    }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch (e) {}
      ta.remove();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done).catch(fallback);
    } else { fallback(); }
  });
})();

/* ---- admin, loaded only when asked for ------------------------------------ */

var adminLoading = false;
function openAdmin() {
  if (window.LupinAdmin) { window.LupinAdmin.open(); return; }
  if (adminLoading) return;
  adminLoading = true;
  var s = document.createElement('script');
  s.src = '/assets/admin.js';
  s.onload = function () {
    adminLoading = false;
    if (window.LupinAdmin) window.LupinAdmin.open();
    else toastText('the admin panel failed to start', true);
  };
  s.onerror = function () { adminLoading = false; toastText('could not load the admin panel', true); };
  document.head.appendChild(s);
}

var buf = '';
window.addEventListener('keydown', function (e) {
  var t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
  if (window.LupinAdmin && window.LupinAdmin.isOpen()) return;
  if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
  buf = (buf + e.key.toLowerCase()).slice(-10);
  if (buf.indexOf('lupinadmin') !== -1) { buf = ''; openAdmin(); }
});

/* ---- boot ----------------------------------------------------------------- */

initFx();
fetch('/content.json', { cache: 'no-cache' })
  .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
  .then(function (d) {
    state = normalize(d);
    render();
    startPresence(state.discordId);
  })
  .catch(function () {
    render();
    toastText('could not load the site content', true);
  });

/* the surface admin.js is built against */
window.LupinSite = {
  get state() { return state; },
  reload: function (d) { state = normalize(d); render(); },
  render: render,
  toast: toastText,
  esc: esc,
  uid: uid,
  findIn: findIn,
  imgVal: imgVal,
  ICONS: ICONS,
  FX: { MIN: FX_MIN, MAX: FX_MAX }
};
})();
