---
name: Portal Architecture (legacy, superseded by the web CAD)
description: The old single-server /portal app and how it differs from the new multi-tenant CAD at /cad.
---

# Portal Architecture (legacy)

**Superseded by the web CAD** (`src/website/routes/cadApi.js`, `cadAuth.js`,
`cad/*`, `views/cad.html`). Kept only until the new CAD is confirmed working in
production, then deleted. Do not build on it.

## What is actually there

Two separate implementations, and earlier versions of this note described
neither of them correctly:

- **Live**: `src/website/routes/portal.js` + `portalApi.js`, mounted at
  `/portal` and `/api/portal` by `src/index.js`. Serves
  `src/website/views/portal.html` and `public/js/portal-app.js`.
- **Dead**: the `portal/` directory is a standalone Express app with its own
  `server.js`. It does **not** import `src/index.js` (verified: its imports are
  express, cookie-parser, mongoose, dotenv, url, path, and its own routers), it
  is not mounted anywhere, and it only runs via `npm run portal`. It is a richer
  fork that was never wired up.

## Why it was replaced rather than extended

Both are locked to one server via `PORTAL_GUILD_ID`, so there is no tenancy
boundary to extend — the guild is an environment variable, not a request
parameter.

Two bugs worth remembering, both fixed in the new CAD:

- The old auth fell back to a **hardcoded secret literal** when none was set,
  which makes every session forgeable by anyone who can read the source.
- It requested only the `identify` OAuth scope, so it could never list a user's
  servers, and generated 911 call IDs like `911-M2X8K9`. Dispatch reads the
  trailing segment aloud and matches spoken replies against it, so a
  non-numeric tail made a web-submitted call unreachable by voice.

## The one thing it got right

Panic: upsert `OfficerStatus` with `tenCode: '10-99'` **and**
`panicAnnounced: false`. The field defaults to *true*, so omitting it makes the
alert invisible to `_startPanicPoller` in `voiceListener.js`. The old portal
worked around this by also calling `triggerPanicAlert()`, which announces a
second time — write the flag, do not call the function.
