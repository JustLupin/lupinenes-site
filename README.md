# lupinenes.pp.ua

Personal site for **LupinEnes**. Static front end, four small Vercel functions, and
the content lives in this repo as `public/content.json` — there is no database.

- **Live status** comes from Discord via [Lanyard](https://github.com/Phineas/lanyard).
- **Editing** happens in a hidden admin panel: type `lupinadmin` anywhere on the page.
- **Saving** commits `content.json` back to this repo, which redeploys the site.

---

## How it fits together

```
browser ──► lupinenes.pp.ua (Vercel)
   │            ├── index.html + assets  (static)
   │            └── content.json         (the "database")
   │
   ├──► wss://api.lanyard.rest/socket    live Discord status + activity
   │
   └──► POST /api/save   ──► verifies the Google token ──► commits content.json
        POST /api/upload ──► verifies the Google token ──► commits public/uploads/…
                                                           │
                                             GitHub ◄──────┘
                                                │
                                     auto-redeploy (~40s)
```

A save is a git commit, so every edit is versioned and revertable, and there is no
database to pay for or keep alive.

---

## First-time setup

### 1. Push this to GitHub

Create an **empty private repo** on the account that should own the site, then:

```bash
git remote add origin https://github.com/<owner>/<repo>.git
git push -u origin main
```

### 2. Import it into Vercel

vercel.com → **Add New… → Project** → pick the repo → **Deploy**.
No build settings to change — it is a static site plus `api/`.

### 3. Create the GitHub token (this is what lets saving work)

github.com → Settings → Developer settings → **Fine-grained personal access tokens**
→ *Generate new token*.

| Field | Value |
|---|---|
| Repository access | **Only select repositories** → this repo |
| Permissions → Contents | **Read and write** |
| Expiration | your choice — saving stops working when it expires |

Nothing else needs to be enabled. Contents write on this one repo is the whole scope.

### 4. Create the Google sign-in client

console.cloud.google.com

1. **New Project** (any name).
2. **APIs & Services → OAuth consent screen** → External → fill in app name and your
   email → Save. It can stay in *Testing*; add the admin emails under **Test users**.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   → Application type **Web application**.
4. Under **Authorized JavaScript origins** add every address the site is reachable on:
   - `https://lupinenes.pp.ua`
   - `https://www.lupinenes.pp.ua` — **`www` is a separate origin to Google**, and
     Vercel adds the apex↔www redirect on its own
   - `http://localhost:3000` (only if you want the admin panel to work locally)
5. Copy the **Client ID**. (The client *secret* is not used and never leaves Google.)

> Sign-in only works on an origin listed here — that is what `Error 400:
> origin_mismatch` means. The sign-in dialog prints the page's exact origin, so
> paste that string in rather than guessing which variant is being used.

### 5. Set the environment variables

Vercel → Project → **Settings → Environment Variables** (all environments):

| Name | Value |
|---|---|
| `GITHUB_TOKEN` | the fine-grained token from step 3 |
| `GITHUB_REPO` | `<owner>/<repo>` |
| `GOOGLE_CLIENT_ID` | the client ID from step 4 |
| `ADMIN_EMAILS` | the admin Google accounts, comma-separated |

Optional: `GITHUB_BRANCH` if the default branch is not `main`.

`GET /api/config` echoes back the client id the deployment is actually using, which
is the quickest way to confirm this is set the way you think it is.

**Redeploy after adding them** — functions only pick up env vars on a new deployment.

### 6. Attach the domain

Vercel → Project → Settings → **Domains** → add `lupinenes.pp.ua`.

`pp.ua` is on the Public Suffix List, so Vercel treats `lupinenes.pp.ua` as an apex
domain and asks for an **A record**, not a CNAME. Vercel now issues per-project
values, so use whatever the Domains page shows rather than an address copied from a
guide. The DNS is currently on Cloudflare — if the record is proxied (orange cloud),
switch it to **DNS only** (grey) so Vercel can issue the certificate.

---

## Editing the site

Type **`lupinadmin`** anywhere on the page. Sign in with an allowed Google account.

| Section | What it controls |
|---|---|
| 01 identity | username, tagline, avatar, banner, Discord ID, fallback status |
| 02 about | the About box |
| 03 links | the chips at the bottom |
| 04 .log boxes | the games / anime / roblox lists |
| 05 sections | optional image + text blocks |
| 06 languages | the EN/TR switch; the first language is the default |
| 07 background | colour and size of the drifting circles |
| 08 backup | export/import a JSON copy |

Edits preview live behind the panel. **Nothing is published until you press save**,
and the live site follows about 40 seconds later once Vercel finishes redeploying.

Images are resized and converted to WebP in the browser before upload, so phone
photos do not bloat the repo.

If a translation field is left empty, the default language's text is used.

---

## The Discord status

`discordId` in the content drives it. Enes is **already** monitored by Lanyard, so
there is nothing to join — but if the status ever stops updating, check that he is
still in `discord.gg/UrXF2cfJ7F`, because that is the only reason Lanyard can see him.

Discord exposes presence over its gateway only — there is no REST endpoint for it —
which is why this needs a bot sharing a server with him rather than a plain API call.

| Discord | shows as |
|---|---|
| online | online |
| idle | the design's "busy" slot, labelled *idle* |
| dnd | do not disturb |
| offline / invisible | offline |

The status word for each state is editable per language. Current game and Spotify
track appear under the name when he has one; custom status text is deliberately not
shown. If Lanyard is unreachable the site falls back to the status set in the panel.

---

## Local development

```bash
npm install
npx vercel dev      # needs the env vars above in .env.local
```

`npm test` runs the sanitiser tests — that is the code deciding what is allowed to be
written into the repo, so it is worth keeping green.

Static-only preview (no admin, no saving):

```bash
npx serve public
```

---

## Notes

- `public/content.json` is the source of truth. Editing it by hand and pushing works
  exactly as well as using the panel.
- The admin panel is **not** a security boundary — `/api/save` and `/api/upload`
  verify the Google token server-side and check `ADMIN_EMAILS` there. The client-side
  check only decides what to display.
- `public/uploads/` accumulates images as they are replaced; filenames are content
  hashed so a new upload can never be served from a stale cache. Old ones can be
  deleted whenever, they are only referenced by past commits.
