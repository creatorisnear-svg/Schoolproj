---
name: Two Dashboards — Always Edit site/
description: Two copies of the dashboard exist; always edit site/ (Cloudflare Pages), never src/website/public/ (Koyeb legacy).
---

# Two Dashboards — Always Edit site/

| File | Served by | Who sees it |
|------|-----------|-------------|
| `site/js/dashboard.js` + `site/css/style.css` | Cloudflare Pages | All users at roleplaymanager.xyz — **edit this one** |
| `src/website/public/js/dashboard.js` + `.../style.css` | Koyeb Express | Legacy/secondary, rarely needed |

The dev panel is the other way round since October 2026:
- **`src/website/views/devpanel.html`**, served by the bot at `https://roleplaymanager.tail6dd18c.ts.net/dev` ← edit this. It has everything, including Logs, CyberCom and Donations, and signs in with a cookie.
- `site/dev/index.html` is only a redirect there now (roleplaymanager.xyz/dev). Do not build on it.

**Dashboard API_BASE** is hardcoded in `site/js/dashboard.js` as:
`https://roleplaymanager.tail6dd18c.ts.net` (the Dell since October 2026; it was the Koyeb app before)

**Why:** Changes to `src/website/public/` won't be seen by end users on the live site. Cloudflare Pages auto-deploys `site/` on every GitHub push in ~30s.
