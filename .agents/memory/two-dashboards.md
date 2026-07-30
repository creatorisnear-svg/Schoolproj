---
name: Two Dashboards — Always Edit site/
description: Two copies of the dashboard exist; always edit site/ (Cloudflare Pages), never src/website/public/ (Koyeb legacy).
---

# Two Dashboards — Always Edit site/

| File | Served by | Who sees it |
|------|-----------|-------------|
| `site/js/dashboard.js` + `site/css/style.css` | Cloudflare Pages | All users at roleplaymanager.xyz — **edit this one** |
| `src/website/public/js/dashboard.js` + `.../style.css` | Koyeb Express | Legacy/secondary, rarely needed |

Same rule for the dev panel:
- `roleplaymanager.xyz/dev` → **`site/dev/index.html`** (Cloudflare Pages) ← edit this
- NOT `src/website/views/devpanel.html` (Koyeb-only)

The dev panel calls the Koyeb API (`API_BASE` in that file) with `Authorization: Bearer <DEV_PASSWORD>`.

**Dashboard API_BASE** is hardcoded in `site/js/dashboard.js` as:
`https://severe-daryl-officialplaystation5-0f1738f5.koyeb.app`

**Why:** Changes to `src/website/public/` won't be seen by end users on the live site. Cloudflare Pages auto-deploys `site/` on every GitHub push in ~30s.
