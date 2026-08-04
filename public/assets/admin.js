/* LupinEnes — admin panel. Loaded on demand, never by ordinary visitors.
   Saving posts to /api/save, which verifies the Google token server-side and
   commits content.json to the repo. Nothing here is a security boundary. */
(function () {
'use strict';

var S = window.LupinSite;
var esc = S.esc, uid = S.uid, findIn = S.findIn, imgVal = S.imgVal, ICONS = S.ICONS;
var FX_MIN = S.FX.MIN, FX_MAX = S.FX.MAX;
var TOK_KEY = 'lupinenes.idtoken';
var STATUS_KEYS = { online: 1, busy: 1, dnd: 1, offline: 1 };

var built = false;
var draft = null;                 /* working copy; only pushed live on save */
var published = null;             /* last known published state, for discarding a preview */
var undoStack = [];
var gsiLoading = false;

function $(id) { return document.getElementById(id); }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function toast(m, bad) { S.toast(m, bad); }
function session() { try { return JSON.parse(sessionStorage.getItem(TOK_KEY) || 'null'); } catch (e) { return null; } }
function setSession(v) {
  try { v ? sessionStorage.setItem(TOK_KEY, JSON.stringify(v)) : sessionStorage.removeItem(TOK_KEY); } catch (e) {}
}

/* ---- markup --------------------------------------------------------------- */

var GATE_HTML =
  '<div class="gate" id="gate" hidden>'
  + '<div class="gate-card" role="dialog" aria-modal="true" aria-labelledby="gate-title">'
  + '<p class="gt" id="gate-title">~$ ssh admin@lupinenes</p>'
  + '<p class="gs dim">restricted area — sign in with an authorized google account</p>'
  + '<div class="gsi" id="gsi"></div>'
  + '<p class="gm" id="gate-msg" role="status"></p>'
  + '<p class="gnote">sign-in only works on a domain listed as an authorized javascript origin for this OAuth client.</p>'
  + '<button class="gx" id="gate-close" type="button">esc · cancel</button>'
  + '</div></div>';

var ADMIN_HTML =
  '<div class="admin" id="admin" hidden>'
  + '<header class="abar" data-od-id="admin-bar">'
  + '<p class="at">admin@lupinenes:~ <span class="dim">·</span> panel</p>'
  + '<span class="who" id="whoami"></span>'
  + '<span class="abar-btns">'
  + '<button class="ab dim-b" id="a-undo" type="button" disabled>undo</button>'
  + '<button class="ab primary" id="a-save" type="button">save</button>'
  + '<button class="ab dim-b" id="a-export" type="button">export</button>'
  + '<button class="ab dim-b" id="a-import-btn" type="button">import</button>'
  + '<button class="ab dim-b" id="a-reset" type="button">revert</button>'
  + '<button class="ab dim-b" id="a-out" type="button">sign out</button>'
  + '<button class="ab" id="a-close" type="button">close</button>'
  + '</span></header>'
  + '<div class="abody">'
  + '<section class="sec"><h2 class="st">01 · identity</h2>'
  + '<div class="frow">'
  + '<label class="fld"><span>username</span><input id="f-username" type="text" maxlength="40"></label>'
  + '<label class="fld"><span>fallback status <em>— used only when discord can’t be reached</em></span>'
  + '<select id="f-status"><option value="online">online</option><option value="busy">idle</option>'
  + '<option value="dnd">do not disturb</option><option value="offline">offline</option></select></label>'
  + '</div>'
  + '<label class="fld"><span>tagline <em>— the line under the username</em></span><input id="f-tagline" type="text" maxlength="140"></label>'
  + '<div class="frow mt">'
  + '<label class="fld"><span>status word · online</span><input id="f-st-online" type="text" maxlength="40"></label>'
  + '<label class="fld"><span>status word · idle</span><input id="f-st-busy" type="text" maxlength="40"></label>'
  + '</div><div class="frow">'
  + '<label class="fld"><span>status word · do not disturb</span><input id="f-st-dnd" type="text" maxlength="40"></label>'
  + '<label class="fld"><span>status word · offline</span><input id="f-st-offline" type="text" maxlength="40"></label>'
  + '</div>'
  + '<div class="frow mt">'
  + '<div class="fld"><span>avatar</span><div class="uprow">'
  + '<span class="thumb" id="av-thumb"></span>'
  + '<button class="ab" id="av-btn" type="button">upload…</button>'
  + '<button class="ab dim-b" id="av-reset" type="button">default</button>'
  + '<input type="file" id="av-file" accept="image/*" hidden></div>'
  + '<em class="hint">resized and converted automatically before upload</em></div>'
  + '<div class="fld"><span>banner</span><div class="uprow">'
  + '<span class="thumb wide" id="bn-thumb"></span>'
  + '<button class="ab" id="bn-btn" type="button">upload…</button>'
  + '<button class="ab dim-b" id="bn-reset" type="button">default</button>'
  + '<input type="file" id="bn-file" accept="image/*" hidden></div>'
  + '<em class="hint">no upload = default pattern</em></div>'
  + '</div>'
  + '<label class="fld mt"><span>discord user id <em>— drives the live status dot via lanyard</em></span>'
  + '<input id="f-discord" type="text" maxlength="25" inputmode="numeric"></label>'
  + '</section>'
  + '<section class="sec"><h2 class="st">02 · about <em>— default-language text; translations live in 06</em></h2>'
  + '<div class="frow"><label class="fld"><span>box label</span><input id="f-about-label" type="text" maxlength="40"></label></div>'
  + '<textarea id="f-bio" rows="4"></textarea></section>'
  + '<section class="sec"><h2 class="st">03 · links <em>— the chip shows the handle; the note becomes the tooltip</em></h2>'
  + '<div id="links-ed"></div><button class="ab add" id="link-add" type="button">+ add link</button></section>'
  + '<section class="sec"><h2 class="st">04 · .log boxes</h2>'
  + '<div id="logs-ed"></div><button class="ab add" id="log-add" type="button">+ add box</button></section>'
  + '<section class="sec"><h2 class="st">05 · sections <em>— image + text blocks between about and the .log boxes</em></h2>'
  + '<div id="sections-ed"></div><button class="ab add" id="sect-add" type="button">+ add section</button></section>'
  + '<section class="sec"><h2 class="st">06 · languages <em>— the switch in the top bar · first language = default</em></h2>'
  + '<div id="langs-ed" class="langs-list"></div><button class="ab add" id="lang-add" type="button">+ add language</button></section>'
  + '<section class="sec"><h2 class="st">07 · background <em>— drifting circles behind the page</em></h2>'
  + '<div class="frow">'
  + '<label class="fld"><span>circle color</span><input id="fx-color" type="color" value="#8c8c8c"></label>'
  + '<div class="fld"><span>circle scale</span><div class="fxrow">'
  + '<input id="fx-scale" type="range" min="0.4" max="2" step="0.1" value="1"><span class="fx-val" id="fx-scale-val">×1.0</span>'
  + '</div></div></div>'
  + '<em class="hint">holds still for visitors who prefer reduced motion</em></section>'
  + '<section class="sec"><h2 class="st">08 · backup</h2>'
  + '<p class="dim small">saving commits content.json to the repo, so the live site follows about 40 seconds later. '
  + 'export writes a json copy you can keep; import loads one back into this panel (it is not saved until you press save).</p>'
  + '<input type="file" id="imp-file" accept="application/json,.json" hidden></section>'
  + '</div></div>';

/* ---- api ------------------------------------------------------------------ */

function apiPost(path, payload) {
  var sess = session();
  if (!sess || !sess.token) return Promise.reject(new Error('not signed in'));
  return fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + sess.token },
    body: JSON.stringify(payload)
  }).then(function (r) {
    return r.json().catch(function () { return {}; }).then(function (j) {
      if (!r.ok || !j.ok) {
        var err = new Error(j.error || ('request failed (' + r.status + ')'));
        err.status = r.status;
        throw err;
      }
      return j;
    });
  });
}

function handleApiError(e) {
  if (e && (e.status === 401 || e.status === 403)) {
    setSession(null);
    closeAdmin();
    openGate();
    toast(e.message || 'sign in again', true);
  } else {
    toast(e && e.message ? e.message : 'something went wrong', true);
  }
}

/* Shrink and re-encode in the browser so uploads stay small and the repo does
   not fill up with 8-megapixel phone photos. */
function prepareImage(file, maxW, maxH) {
  return new Promise(function (resolve, reject) {
    if (!/^image\//.test(file.type)) return reject(new Error('that is not an image'));
    if (file.size > 25 * 1024 * 1024) return reject(new Error('that file is too big (max 25 mb)'));
    var url = URL.createObjectURL(file);
    var im = new Image();
    im.onload = function () {
      URL.revokeObjectURL(url);
      var w = im.naturalWidth, h = im.naturalHeight;
      var k = Math.min(1, maxW / w, maxH / h);
      var cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
      var cv = document.createElement('canvas');
      cv.width = cw; cv.height = ch;
      var cx = cv.getContext('2d');
      cx.imageSmoothingQuality = 'high';
      cx.drawImage(im, 0, 0, cw, ch);
      var out = cv.toDataURL('image/webp', 0.86);
      if (out.indexOf('data:image/webp') !== 0) out = cv.toDataURL('image/jpeg', 0.88);
      resolve(out);
    };
    im.onerror = function () { URL.revokeObjectURL(url); reject(new Error('could not read that image')); };
    im.src = url;
  });
}

function uploadImage(kind, dataUrl) {
  return apiPost('/api/upload', { kind: kind, dataUrl: dataUrl }).then(function (j) { return j.path; });
}

/* ---- editors -------------------------------------------------------------- */

function linkRow(l, note) {
  var opts = Object.keys(ICONS).map(function (k) {
    return '<option value="' + k + '"' + ((l && l.icon) === k ? ' selected' : '') + '>' + k + '</option>';
  }).join('');
  var row = document.createElement('div');
  row.className = 'ledit-row';
  row.dataset.id = l && l.id ? l.id : uid('l');
  row.innerHTML =
    '<select class="lk-icon" title="icon">' + opts + '</select>'
    + '<input class="lk-label" type="text" placeholder="@handle">'
    + '<input class="lk-url" type="text" placeholder="https://…">'
    + '<input class="lk-note" type="text" placeholder="note (tooltip, default language)">'
    + '<button class="rm" type="button" title="remove">×</button>';
  row.querySelector('.lk-label').value = l ? (l.label || '') : '';
  row.querySelector('.lk-url').value = l ? (l.url || '') : '';
  row.querySelector('.lk-note').value = note || '';
  row.querySelector('.rm').addEventListener('click', function () { snapshot(); row.remove(); });
  return row;
}
function buildLinksEd() {
  var box = $('links-ed');
  box.innerHTML = '';
  var T0 = draft.langs[0].texts;
  draft.links.forEach(function (l) {
    var m = findIn(T0.links, l.id);
    box.appendChild(linkRow(l, m ? m.note : ''));
  });
}

function logRow(r) {
  var row = document.createElement('div');
  row.className = 'ledit-row';
  row.dataset.id = r && r.id ? r.id : uid('r');
  row.innerHTML =
    '<input class="rw-name" type="text" placeholder="name">'
    + '<input class="rw-url" type="text" placeholder="url (optional)">'
    + '<input class="rw-note" type="text" placeholder="note (optional, default language)">'
    + '<button class="rm" type="button" title="remove">×</button>';
  row.querySelector('.rw-name').value = r ? (r.name || '') : '';
  row.querySelector('.rw-url').value = r ? (r.url || '') : '';
  row.querySelector('.rw-note').value = r ? (r.note || '') : '';
  row.querySelector('.rm').addEventListener('click', function () { snapshot(); row.remove(); });
  return row;
}
function logBox(log, tlog) {
  var box = document.createElement('div');
  box.className = 'ledit-log';
  box.dataset.id = log && log.id ? log.id : uid('g');
  box.innerHTML =
    '<div class="log-meta">'
    + '<input class="lg-title" type="text" placeholder="title (e.g. games.log)">'
    + '<input class="lg-lead" type="text" placeholder="lead line (optional)">'
    + '<input class="lg-tail" type="text" placeholder="tail line (optional)">'
    + '</div><div class="log-rows"></div><div class="controls">'
    + '<button class="ab dim-b lw-add" type="button">+ row</button>'
    + '<button class="ab dim-b lg-remove" type="button">remove box</button></div>';
  box.querySelector('.lg-title').value = tlog ? (tlog.title || '') : '';
  box.querySelector('.lg-lead').value = tlog ? (tlog.lead || '') : '';
  box.querySelector('.lg-tail').value = tlog ? (tlog.tail || '') : '';
  var rows = box.querySelector('.log-rows');
  (log && log.rows ? log.rows : []).forEach(function (r) {
    var tn = tlog && tlog.rows ? findIn(tlog.rows, r.id) : null;
    rows.appendChild(logRow({ id: r.id, name: r.name, url: r.url, note: tn ? (tn.note || '') : '' }));
  });
  box.querySelector('.lw-add').addEventListener('click', function () { snapshot(); rows.appendChild(logRow(null)); });
  box.querySelector('.lg-remove').addEventListener('click', function () { snapshot(); box.remove(); });
  return box;
}
function buildLogsEd() {
  var box = $('logs-ed');
  box.innerHTML = '';
  var T0 = draft.langs[0].texts;
  draft.logs.forEach(function (l) { box.appendChild(logBox(l, findIn(T0.logs, l.id))); });
}

function sectCard(sec, tsec) {
  tsec = tsec || { title: '', body: '' };
  var card = document.createElement('div');
  card.className = 'sect-card';
  card.dataset.id = sec && sec.id ? sec.id : uid('s');
  card.innerHTML =
    '<div class="sect-head">'
    + '<input class="sc-title" type="text" placeholder="title (e.g. My Setup)">'
    + '<label class="fld sc-side-l"><span>image side</span>'
    + '<select class="sc-side"><option value="right">right</option><option value="left">left</option></select></label>'
    + '<div class="sc-pos"><button class="ab sc-up" type="button" title="move up">↑</button>'
    + '<button class="ab sc-down" type="button" title="move down">↓</button></div>'
    + '</div>'
    + '<textarea class="sc-text" rows="3" placeholder="text (default language)"></textarea>'
    + '<div class="sc-uprow"><span class="scthumb"></span>'
    + '<button class="ab sc-up-btn" type="button">upload image…</button>'
    + '<button class="ab dim-b sc-img-rm" type="button">no image</button>'
    + '<input type="file" class="sc-file" accept="image/*" hidden>'
    + '<button class="ab dim-b sc-remove" type="button">remove section</button></div>';
  card.querySelector('.sc-title').value = tsec.title || '';
  card.querySelector('.sc-side').value = sec && sec.side === 'left' ? 'left' : 'right';
  card.querySelector('.sc-text').value = tsec.body || '';
  card._img = sec && sec.image ? sec.image : null;

  function paint() { card.querySelector('.scthumb').style.backgroundImage = card._img ? 'url("' + card._img + '")' : ''; }
  paint();

  card.querySelector('.sc-up-btn').addEventListener('click', function () { card.querySelector('.sc-file').click(); });
  card.querySelector('.sc-file').addEventListener('change', function () {
    var f = this.files && this.files[0];
    this.value = '';
    if (!f) return;
    toast('uploading section image…');
    prepareImage(f, 1400, 1400)
      .then(function (d) { return uploadImage('section', d); })
      .then(function (path) { snapshot(); card._img = path; paint(); toast('section image uploaded'); })
      .catch(handleApiError);
  });
  card.querySelector('.sc-img-rm').addEventListener('click', function () {
    if (card._img) snapshot();
    card._img = null; paint();
  });
  card.querySelector('.sc-remove').addEventListener('click', function () { snapshot(); card.remove(); });
  card.querySelector('.sc-up').addEventListener('click', function () {
    if (!card.previousElementSibling) return;
    snapshot();
    card.parentNode.insertBefore(card, card.previousElementSibling);
  });
  card.querySelector('.sc-down').addEventListener('click', function () {
    if (!card.nextElementSibling) return;
    snapshot();
    card.parentNode.insertBefore(card.nextElementSibling, card);
  });
  return card;
}
function buildSectionsEd() {
  var box = $('sections-ed');
  box.innerHTML = '';
  var T0 = draft.langs[0].texts;
  draft.sections.forEach(function (sec) { box.appendChild(sectCard(sec, findIn(T0.sections, sec.id))); });
}

function langTextEd(container, texts) {
  var T0 = draft.langs[0].texts;
  var html = '<div class="lang-texts">';
  html += '<p class="lt-h">texts <span class="dim">— leave a field empty to reuse the default language’s</span></p>';
  html += '<div class="frow">'
    + '<label class="fld"><span>username</span><input class="lt-username" type="text" maxlength="40"></label>'
    + '<label class="fld"><span>tagline</span><input class="lt-tagline" type="text" maxlength="140"></label></div>';
  html += '<label class="fld"><span>about label</span><input class="lt-aboutlabel" type="text" maxlength="40"></label>';
  html += '<label class="fld mt"><span>about text</span><textarea class="lt-bio" rows="3"></textarea></label>';
  html += '<div class="frow mt">'
    + '<label class="fld"><span>status · online</span><input class="lt-st-online" type="text" maxlength="40"></label>'
    + '<label class="fld"><span>status · idle</span><input class="lt-st-busy" type="text" maxlength="40"></label>'
    + '</div><div class="frow">'
    + '<label class="fld"><span>status · do not disturb</span><input class="lt-st-dnd" type="text" maxlength="40"></label>'
    + '<label class="fld"><span>status · offline</span><input class="lt-st-offline" type="text" maxlength="40"></label></div>';
  if (draft.links.length) {
    html += '<p class="lt-h mt">link tooltips</p>';
    draft.links.forEach(function (l) {
      html += '<label class="fld mt"><span>' + esc(l.label || l.url) + '</span>'
        + '<input class="lt-link-note" data-id="' + esc(l.id) + '" type="text"></label>';
    });
  }
  if (draft.logs.length) {
    html += '<p class="lt-h mt">.log boxes</p>';
    draft.logs.forEach(function (g) {
      var tg = findIn(T0.logs, g.id);
      html += '<div class="ledit-log"><div class="log-meta">'
        + '<input class="lt-log-title" data-id="' + esc(g.id) + '" type="text" placeholder="title (' + esc(tg ? tg.title : '') + ')">'
        + '<input class="lt-log-lead" data-id="' + esc(g.id) + '" type="text" placeholder="lead line">'
        + '<input class="lt-log-tail" data-id="' + esc(g.id) + '" type="text" placeholder="tail line"></div>';
      (g.rows || []).forEach(function (r) {
        html += '<div class="ledit-row"><span class="rw-name dim small">' + esc(r.name || '…') + '</span>'
          + '<input class="lt-row-note" data-gid="' + esc(g.id) + '" data-id="' + esc(r.id) + '" type="text" placeholder="note"></div>';
      });
      html += '</div>';
    });
  }
  if (draft.sections.length) {
    html += '<p class="lt-h mt">sections</p>';
    draft.sections.forEach(function (sx) {
      var ts = findIn(T0.sections, sx.id);
      html += '<div class="ledit-log">'
        + '<input class="lt-sec-title" data-id="' + esc(sx.id) + '" type="text" placeholder="title (' + esc(ts ? ts.title : '') + ')">'
        + '<textarea class="lt-sec-body" data-id="' + esc(sx.id) + '" rows="2" placeholder="text"></textarea></div>';
    });
  }
  html += '</div>';
  var wrap = document.createElement('div');
  wrap.innerHTML = html;
  container.appendChild(wrap.firstChild);

  var q = function (sel) { return container.querySelector(sel); };
  q('.lt-username').value = texts.username || '';
  q('.lt-tagline').value = texts.tagline || '';
  q('.lt-aboutlabel').value = texts.aboutLabel || '';
  q('.lt-bio').value = texts.bio || '';
  ['online', 'busy', 'dnd', 'offline'].forEach(function (k) {
    q('.lt-st-' + k).value = (texts.statusLabels && texts.statusLabels[k]) || '';
  });
  var each = function (sel, fn) { Array.prototype.forEach.call(container.querySelectorAll(sel), fn); };
  each('.lt-link-note', function (i) { var m = findIn(texts.links, i.dataset.id); i.value = m ? (m.note || '') : ''; });
  each('.lt-log-title', function (i) { var m = findIn(texts.logs, i.dataset.id); i.value = m ? (m.title || '') : ''; });
  each('.lt-log-lead', function (i) { var m = findIn(texts.logs, i.dataset.id); i.value = m ? (m.lead || '') : ''; });
  each('.lt-log-tail', function (i) { var m = findIn(texts.logs, i.dataset.id); i.value = m ? (m.tail || '') : ''; });
  each('.lt-row-note', function (i) {
    var g = findIn(texts.logs, i.dataset.gid);
    var m = g ? findIn(g.rows, i.dataset.id) : null;
    i.value = m ? (m.note || '') : '';
  });
  each('.lt-sec-title', function (i) { var m = findIn(texts.sections, i.dataset.id); i.value = m ? (m.title || '') : ''; });
  each('.lt-sec-body', function (i) { var m = findIn(texts.sections, i.dataset.id); i.value = m ? (m.body || '') : ''; });
}

function langCard(L, isDefault) {
  var card = document.createElement('div');
  card.className = 'lang-card';
  card.dataset.code = L.code || '';
  card.innerHTML =
    '<div class="lang-head">'
    + '<label class="fld lc-code"><span>code</span><input class="lc-code-i" type="text" maxlength="8" placeholder="tr"></label>'
    + '<label class="fld"><span>switch label</span><input class="lc-label" type="text" maxlength="6" placeholder="TR"></label>'
    + (isDefault ? '<span class="ld-badge">default · texts edited in 01–05 above</span>' : '')
    + '<span class="lang-actions">'
    + '<button class="ab lc-up" type="button" title="move up">↑</button>'
    + '<button class="ab lc-down" type="button" title="move down">↓</button>'
    + (isDefault ? '' : '<button class="ab dim-b lc-remove" type="button">remove</button>')
    + '</span></div>';
  card.querySelector('.lc-code-i').value = L.code || '';
  card.querySelector('.lc-label').value = L.label || '';
  card.querySelector('.lc-up').addEventListener('click', function () {
    if (!card.previousElementSibling) return;
    snapshot();
    card.parentNode.insertBefore(card, card.previousElementSibling);
  });
  card.querySelector('.lc-down').addEventListener('click', function () {
    if (!card.nextElementSibling) return;
    snapshot();
    card.parentNode.insertBefore(card.nextElementSibling, card);
  });
  if (!isDefault) {
    card.querySelector('.lc-remove').addEventListener('click', function () { snapshot(); card.remove(); });
    langTextEd(card, L.texts || {});
  } else {
    var note = document.createElement('p');
    note.className = 'lt-note mt';
    note.textContent = 'this is the default language — its texts are the fields in sections 01–05. move it down to make another language the default.';
    card.appendChild(note);
  }
  return card;
}
function buildLangsEd() {
  var box = $('langs-ed');
  box.innerHTML = '';
  draft.langs.forEach(function (L, i) { box.appendChild(langCard(L, i === 0)); });
}

function refreshThumbs() {
  $('av-thumb').style.backgroundImage = 'url("' + (draft.avatar || '/uploads/avatar.webp') + '")';
  $('bn-thumb').style.backgroundImage = draft.banner ? 'url("' + draft.banner + '")' : '';
}

function buildAdmin() {
  var T0 = draft.langs[0].texts;
  $('f-username').value = T0.username || '';
  $('f-tagline').value = T0.tagline || '';
  $('f-status').value = STATUS_KEYS[draft.status] ? draft.status : 'online';
  $('f-st-online').value = (T0.statusLabels && T0.statusLabels.online) || '';
  $('f-st-busy').value = (T0.statusLabels && T0.statusLabels.busy) || '';
  $('f-st-dnd').value = (T0.statusLabels && T0.statusLabels.dnd) || '';
  $('f-st-offline').value = (T0.statusLabels && T0.statusLabels.offline) || '';
  $('f-about-label').value = T0.aboutLabel || '';
  $('f-bio').value = T0.bio || '';
  $('f-discord').value = draft.discordId || '';
  $('fx-color').value = /^#[0-9a-f]{6}$/i.test(draft.bgColor || '') ? draft.bgColor.toLowerCase() : '#8c8c8c';
  var bgs = Math.min(FX_MAX, Math.max(FX_MIN, parseFloat(draft.bgScale) || 1));
  $('fx-scale').value = String(bgs);
  $('fx-scale-val').textContent = '×' + bgs.toFixed(1);
  refreshThumbs();
  buildLinksEd();
  buildLogsEd();
  buildSectionsEd();
  buildLangsEd();
  var sess = session();
  $('whoami').textContent = sess ? sess.email : '';
}

function collect() {
  var d = {
    status: STATUS_KEYS[$('f-status').value] ? $('f-status').value : 'online',
    discordId: $('f-discord').value.trim().replace(/[^0-9]/g, ''),
    avatar: draft.avatar,
    banner: draft.banner,
    bgColor: '#8c8c8c',
    bgScale: 1,
    links: [], logs: [], sections: [], langs: []
  };
  var t0 = {
    username: $('f-username').value.trim() || 'LupinEnes',
    tagline: $('f-tagline').value.trim(),
    bio: $('f-bio').value.trim(),
    aboutLabel: $('f-about-label').value.trim(),
    statusLabels: {
      online: $('f-st-online').value.trim(),
      busy: $('f-st-busy').value.trim(),
      dnd: $('f-st-dnd').value.trim(),
      offline: $('f-st-offline').value.trim()
    },
    links: [], logs: [], sections: []
  };

  Array.prototype.forEach.call($('links-ed').querySelectorAll('.ledit-row'), function (row) {
    var label = row.querySelector('.lk-label').value.trim();
    var url = row.querySelector('.lk-url').value.trim();
    if (!label && !url) return;
    d.links.push({ id: row.dataset.id, icon: row.querySelector('.lk-icon').value, label: label || url, url: url });
    t0.links.push({ id: row.dataset.id, note: row.querySelector('.lk-note').value.trim() });
  });

  Array.prototype.forEach.call($('logs-ed').querySelectorAll('.ledit-log'), function (box) {
    var boxId = box.dataset.id;
    var rows = [], trows = [];
    Array.prototype.forEach.call(box.querySelectorAll('.log-rows .ledit-row'), function (r) {
      var name = r.querySelector('.rw-name').value.trim();
      if (!name) return;
      rows.push({ id: r.dataset.id, name: name, url: r.querySelector('.rw-url').value.trim() });
      trows.push({ id: r.dataset.id, note: r.querySelector('.rw-note').value.trim() });
    });
    var title = box.querySelector('.lg-title').value.trim();
    if (!title && !rows.length) return;
    d.logs.push({ id: boxId, rows: rows });
    t0.logs.push({
      id: boxId, title: title || 'untitled.log',
      lead: box.querySelector('.lg-lead').value.trim(),
      tail: box.querySelector('.lg-tail').value.trim(),
      rows: trows
    });
  });

  Array.prototype.forEach.call($('sections-ed').querySelectorAll('.sect-card'), function (card) {
    var title = card.querySelector('.sc-title').value.trim();
    var body = card.querySelector('.sc-text').value.trim();
    if (!title && !body && !card._img) return;
    d.sections.push({ id: card.dataset.id, side: card.querySelector('.sc-side').value === 'left' ? 'left' : 'right', image: card._img || null });
    t0.sections.push({ id: card.dataset.id, title: title, body: body });
  });

  var seen = {};
  Array.prototype.forEach.call($('langs-ed').querySelectorAll('.lang-card'), function (card, i) {
    var code = card.querySelector('.lc-code-i').value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    var label = card.querySelector('.lc-label').value.trim();
    if (!code) code = i === 0 ? 'en' : 'lang' + (i + 1);
    while (seen[code]) code += 'x';
    seen[code] = 1;

    var texts = t0;
    if (i !== 0) {
      texts = {
        username: card.querySelector('.lt-username').value.trim(),
        tagline: card.querySelector('.lt-tagline').value.trim(),
        bio: card.querySelector('.lt-bio').value.trim(),
        aboutLabel: card.querySelector('.lt-aboutlabel').value.trim(),
        statusLabels: {
          online: card.querySelector('.lt-st-online').value.trim(),
          busy: card.querySelector('.lt-st-busy').value.trim(),
          dnd: card.querySelector('.lt-st-dnd').value.trim(),
          offline: card.querySelector('.lt-st-offline').value.trim()
        },
        links: [], logs: [], sections: []
      };
      var val = function (sel) { var el = card.querySelector(sel); return el ? el.value.trim() : ''; };
      d.links.forEach(function (l) {
        texts.links.push({ id: l.id, note: val('.lt-link-note[data-id="' + l.id + '"]') });
      });
      d.logs.forEach(function (g) {
        var entry = {
          id: g.id,
          title: val('.lt-log-title[data-id="' + g.id + '"]'),
          lead: val('.lt-log-lead[data-id="' + g.id + '"]'),
          tail: val('.lt-log-tail[data-id="' + g.id + '"]'),
          rows: []
        };
        g.rows.forEach(function (r) {
          entry.rows.push({ id: r.id, note: val('.lt-row-note[data-gid="' + g.id + '"][data-id="' + r.id + '"]') });
        });
        texts.logs.push(entry);
      });
      d.sections.forEach(function (sx) {
        texts.sections.push({
          id: sx.id,
          title: val('.lt-sec-title[data-id="' + sx.id + '"]'),
          body: val('.lt-sec-body[data-id="' + sx.id + '"]')
        });
      });
    }
    d.langs.push({ code: code, label: label || code.toUpperCase(), texts: texts });
  });
  if (!d.langs.length) d.langs.push({ code: 'en', label: 'EN', texts: t0 });

  var fc = $('fx-color').value;
  d.bgColor = /^#[0-9a-f]{6}$/i.test(fc || '') ? fc.toLowerCase() : '#8c8c8c';
  var fs = parseFloat($('fx-scale').value);
  d.bgScale = Math.min(FX_MAX, Math.max(FX_MIN, isNaN(fs) ? 1 : fs));
  return d;
}

function snapshot() {
  undoStack.push(collect());
  if (undoStack.length > 60) undoStack.shift();
  $('a-undo').disabled = undoStack.length === 0;
}

/* ---- preview -------------------------------------------------------------- */
/* Everything typed shows on the page behind the panel straight away; only the
   save button writes it to the repo. */
function preview() {
  draft = collect();
  S.reload(clone(draft));
}

/* ---- gate ----------------------------------------------------------------- */

function openGate() {
  $('gate').hidden = false;
  loadGSI();
}
function closeGate() {
  $('gate').hidden = true;
  $('gate-msg').textContent = '';
  $('gate-msg').className = 'gm';
}
var clientId = null;
function loadGSI() {
  var msg = $('gate-msg');
  msg.textContent = 'loading google sign-in…';
  msg.className = 'gm';

  var needConfig = clientId
    ? Promise.resolve(clientId)
    : fetch('/api/config').then(function (r) { return r.json(); }).then(function (j) {
        clientId = (j && j.googleClientId) || '';
        return clientId;
      });

  needConfig.then(function (id) {
    if (!id) {
      msg.textContent = 'GOOGLE_CLIENT_ID is not set on this deployment';
      msg.className = 'gm bad';
      return;
    }
    if (window.google && window.google.accounts && window.google.accounts.id) { initGSI(); return; }
    if (gsiLoading) return;
    gsiLoading = true;
    var s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = function () { gsiLoading = false; initGSI(); };
    s.onerror = function () {
      gsiLoading = false;
      msg.textContent = 'could not reach google — check your connection';
      msg.className = 'gm bad';
    };
    document.head.appendChild(s);
  }).catch(function () {
    msg.textContent = 'could not read the sign-in configuration';
    msg.className = 'gm bad';
  });
}
function initGSI() {
  var msg = $('gate-msg');
  if (!clientId) {
    msg.textContent = 'GOOGLE_CLIENT_ID is not set on this deployment';
    msg.className = 'gm bad';
    return;
  }
  msg.textContent = '';
  $('gsi').innerHTML = '';
  try {
    window.google.accounts.id.initialize({ client_id: clientId, callback: onCredential });
    window.google.accounts.id.renderButton($('gsi'), {
      theme: 'filled_black', size: 'large', shape: 'rectangular',
      text: 'signin_with', logo_alignment: 'left', width: 280
    });
  } catch (e) {
    msg.textContent = 'sign-in failed to initialize';
    msg.className = 'gm bad';
  }
}
function jwtClaims(tok) {
  try {
    var part = tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    while (part.length % 4) part += '=';
    return JSON.parse(decodeURIComponent(atob(part).split('').map(function (c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join('')));
  } catch (e) { return null; }
}
/* This only decides what to show. The server verifies the token properly. */
function onCredential(res) {
  var msg = $('gate-msg');
  var tok = res && res.credential;
  var claims = tok ? jwtClaims(tok) : null;
  if (!claims || !claims.email) {
    msg.textContent = 'bad credential — try again';
    msg.className = 'gm bad';
    return;
  }
  setSession({ token: tok, email: String(claims.email).toLowerCase(), exp: claims.exp || 0 });
  closeGate();
  openAdmin();
  toast('welcome, ' + claims.email);
}

/* ---- open / close --------------------------------------------------------- */

function openAdmin() {
  /* what is actually live, so closing can throw away an unsaved preview */
  published = clone(S.state);
  draft = clone(S.state);
  undoStack = [];
  buildAdmin();
  $('a-undo').disabled = true;
  $('admin').hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeAdmin() {
  if ($('admin')) $('admin').hidden = true;
  document.body.style.overflow = '';
  if (published) S.reload(clone(published));
}
function isOpen() {
  return built && ((!$('admin').hidden) || (!$('gate').hidden));
}

/* ---- wiring --------------------------------------------------------------- */

function build() {
  if (built) return;
  var host = document.createElement('div');
  host.innerHTML = GATE_HTML + ADMIN_HTML;
  while (host.firstChild) document.body.appendChild(host.firstChild);
  built = true;

  $('gate-close').addEventListener('click', closeGate);
  $('gate').addEventListener('click', function (e) { if (e.target === this) closeGate(); });
  $('a-close').addEventListener('click', closeAdmin);

  $('a-out').addEventListener('click', function () {
    setSession(null);
    if (window.google && window.google.accounts && window.google.accounts.id) {
      try { window.google.accounts.id.disableAutoSelect(); } catch (e) {}
    }
    closeAdmin();
    toast('signed out');
  });

  $('a-undo').addEventListener('click', function () {
    if (!undoStack.length) return;
    draft = undoStack.pop();
    $('a-undo').disabled = undoStack.length === 0;
    buildAdmin();
    S.reload(clone(draft));
    toast('undone');
  });

  $('a-save').addEventListener('click', function () {
    var btn = this;
    if (btn.classList.contains('busy')) return;
    draft = collect();
    btn.classList.add('busy');
    btn.textContent = 'saving…';
    apiPost('/api/save', { content: draft })
      .then(function (j) {
        draft = j.content;                 /* the sanitised version the server actually stored */
        published = clone(j.content);
        undoStack = [];
        $('a-undo').disabled = true;
        S.reload(clone(draft));
        buildAdmin();
        toast('saved — the live site updates in about 40 seconds');
      })
      .catch(handleApiError)
      .then(function () { btn.classList.remove('busy'); btn.textContent = 'save'; });
  });

  $('a-reset').addEventListener('click', function () {
    if (!window.confirm('discard your unsaved edits and reload what is currently published?')) return;
    fetch('/content.json', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        S.reload(d);
        draft = clone(S.state);
        published = clone(S.state);
        undoStack = [];
        buildAdmin();
        $('a-undo').disabled = true;
        toast('reverted to the published version');
      })
      .catch(function () { toast('could not reload the published content', true); });
  });

  $('a-export').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(collect(), null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'lupinenes-content.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  });

  $('a-import-btn').addEventListener('click', function () { $('imp-file').click(); });
  $('imp-file').addEventListener('change', function () {
    var f = this.files && this.files[0];
    this.value = '';
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var d = JSON.parse(r.result);
        if (typeof d !== 'object' || d === null) throw new Error('bad');
        snapshot();
        S.reload(d);
        draft = clone(S.state);
        buildAdmin();
        toast('imported — press save to publish it');
      } catch (e) { toast('import failed — not valid content json', true); }
    };
    r.readAsText(f);
  });

  function pickImage(inputId, kind, maxW, maxH, apply) {
    $(inputId).addEventListener('change', function () {
      var f = this.files && this.files[0];
      this.value = '';
      if (!f) return;
      toast('uploading…');
      prepareImage(f, maxW, maxH)
        .then(function (d) { return uploadImage(kind, d); })
        .then(function (path) {
          snapshot();
          apply(path);
          refreshThumbs();
          S.reload(clone(draft));
          toast(kind + ' uploaded — press save to publish it');
        })
        .catch(handleApiError);
    });
  }
  $('av-btn').addEventListener('click', function () { $('av-file').click(); });
  $('bn-btn').addEventListener('click', function () { $('bn-file').click(); });
  pickImage('av-file', 'avatar', 512, 512, function (p) { draft.avatar = p; });
  pickImage('bn-file', 'banner', 1600, 640, function (p) { draft.banner = p; });

  $('av-reset').addEventListener('click', function () {
    if (draft.avatar) snapshot();
    draft.avatar = null; refreshThumbs(); S.reload(clone(draft));
  });
  $('bn-reset').addEventListener('click', function () {
    if (draft.banner) snapshot();
    draft.banner = null; refreshThumbs(); S.reload(clone(draft));
  });

  $('link-add').addEventListener('click', function () { snapshot(); $('links-ed').appendChild(linkRow(null, '')); });
  $('log-add').addEventListener('click', function () { snapshot(); $('logs-ed').appendChild(logBox(null, null)); });
  $('sect-add').addEventListener('click', function () { snapshot(); $('sections-ed').appendChild(sectCard(null, null)); });
  $('lang-add').addEventListener('click', function () {
    snapshot();
    $('langs-ed').appendChild(langCard({ code: '', label: '', texts: {} }, false));
    toast('added a language — set its code, label and translations');
  });

  $('fx-color').addEventListener('input', function () {
    if (/^#[0-9a-f]{6}$/i.test(this.value)) { draft.bgColor = this.value.toLowerCase(); S.reload(clone(draft)); }
  });
  $('fx-scale').addEventListener('input', function () {
    var v = parseFloat(this.value);
    draft.bgScale = Math.min(FX_MAX, Math.max(FX_MIN, isNaN(v) ? 1 : v));
    $('fx-scale-val').textContent = '×' + draft.bgScale.toFixed(1);
    S.reload(clone(draft));
  });

  /* live preview as he types, without thrashing the renderer */
  var t = null;
  $('admin').addEventListener('input', function (e) {
    if (e.target.id === 'fx-color' || e.target.id === 'fx-scale') return;
    clearTimeout(t);
    t = setTimeout(preview, 260);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || !built) return;
    if (!$('gate').hidden) closeGate();
    else if (!$('admin').hidden) closeAdmin();
  });
}

window.LupinAdmin = {
  open: function () {
    build();
    var sess = session();
    if (sess && sess.token && (!sess.exp || sess.exp * 1000 > Date.now() + 30000)) openAdmin();
    else { setSession(null); openGate(); }
  },
  isOpen: isOpen
};
})();
