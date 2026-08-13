---
name: Deployment Architecture
description: Production runs on Koyeb (bot+API) and Cloudflare Pages (static site). Replit is dev/editing only.
---

# Deployment Architecture

```
GitHub repo (single codebase)
  ├── Koyeb Instance → Bot + API server (npm start → src/index.js), PORT=8000
  │     Portal also mounted here at /portal
  └── Cloudflare Pages → Static site (site/ directory)
        Auto-deploys on GitHub push, custom domain roleplaymanager.xyz
```

- **Replit is dev/editing only** — changes must be pushed to GitHub to reach production
- Cloudflare Pages auto-deploys in ~30s after push
- Koyeb takes ~2min to deploy
- Bot may not connect properly to MongoDB/Discord inside Replit

**Required env vars on Koyeb:**
`DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `MONGODB_URI`, `OPENAI_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SITE_ORIGIN`, `DOMAIN`, `PORT` (8000), `PORTAL_GUILD_ID`, `PORTAL_DOMAIN`, `BOT_INTERNAL_URL`, `DEV_PASSWORD`, `TOPGG_BOT_ID`, `TOPGG_WEBHOOK_SECRET`, `CHANGELOG_WEBHOOK_URL`

**Locally on Replit only needs:** `DISCORD_TOKEN`, `MONGODB_URI` (rest pre-set in .replit userenv.shared), PORT=5000
