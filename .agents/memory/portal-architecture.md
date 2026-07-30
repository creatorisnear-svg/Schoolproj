---
name: Portal Architecture (Civ/LEO Web App)
description: Express SPA at /portal on Koyeb; Discord OAuth2 auth; Civilian vs LEO modes; priority polling every 5s.
---

# Portal Architecture

- **Entry:** `portal/server.js` (imports `src/index.js` for the shared bot client)
- **Mounted at:** `/portal` on the same Koyeb instance as the bot
- **Auth:** Discord OAuth2 → HMAC-signed `portal_session` cookie (`portal/routes/auth.js`), callback at `/portal/auth/callback`. All `/api/portal/*` routes require `portalAuth` middleware.
- **Frontend:** `portal/views/portal.html` (shell), `portal/public/js/portal-app.js` (SPA), `portal/public/css/portal.css`
- **CSS vars:** `--surface`/`--card`/`--elevated`, `--accent` #5865f2, `--danger` red, `--warning` amber, `var(--radius)` 10px, no emojis
- **Modes:** Civilian (default) vs LEO (requires LEO Discord role, `isLeo: true`); stored in `localStorage.portalMode`

**Key API routes (`/api/portal/`):**
`GET /me`, `GET/POST/DELETE /characters`, `GET/POST /vehicles`, `GET /officers/overview`, `GET /voice/channels`, `POST /voice/move`, `GET /civjobs`, `POST /civjobs/checkin/:jobId` + `checkout`, `POST /emergency`, `GET /priority`

**Priority polling:** Both civilians and LEOs poll `GET /priority` every 5s via `startGlobalPriorityPoll()` — updates global bar, Overview widget, Priority tab, and fires browser push notifications on state changes.

**Panic button flow:** Portal upserts `OfficerStatus` with `tenCode: '10-99', panicAnnounced: false`. Bot's `voiceListener.js` runs `_startPanicPoller` every 5s, finds unannounced panics, fires TTS + embed. Optional direct trigger via `BOT_INTERNAL_URL/internal/panic`.
