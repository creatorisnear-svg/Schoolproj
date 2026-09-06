---
name: Web CAD
description: Multi-tenant CAD at /cad; tenancy via resolveGuild; call IDs must end in a number; panic must write panicAnnounced false.
---

# Web CAD

Served by the bot process (not Cloudflare Pages) so the browser is same-origin
with the API — that is what makes the session cookie and the SSE stream work
without touching the single-origin CORS check in `src/index.js`.

- `routes/cadAuth.js` — Discord OAuth2, scope `identify guilds`, HMAC-signed
  httpOnly `cad_session` cookie holding the Discord access token.
- `routes/cadApi.js` — router assembly, `resolveGuild`, `/servers`, `/context`.
- `routes/cad/{civilian,leo,events,shared}.js` — the route groups.
- `cadBridge.js` — every Discord side effect.
- `views/cad.html`, `public/js/cad-app.js`, `public/css/cad.css`.

## Things that are easy to get wrong

**Call IDs must end in a number.** Dispatch speaks the trailing segment aloud and
matches an officer's spoken reply with `callId.split('-').pop()`. The format is
`${guildId}-${4 digits}`, matching what `/911` produces. The old portal generated
`911-M2X8K9`, which voice dispatch could neither announce nor attach to.

**Panic must write `panicAnnounced: false` explicitly.** The field defaults to
*true*, so an upsert that omits it is invisible to `_startPanicPoller` in
`voiceListener.js` and the alert is silently never spoken. Non-panic codes write
`true`, so an officer going 10-8 clears a stale pending panic. Write the flag —
do **not** also call `triggerPanicAlert()`, or it announces twice.

**A web 911 is saved with `dispatchAnnounced: false`** and the voice poller picks
it up within about 5 seconds. The Discord embed is posted separately by
`announceWeb911` to `RoleplayCommands.use911Channel` (falling back to the
dispatch channel), with the `911_respond_` / `911_attach_` / `911_dismiss_`
custom IDs the existing `emergencyButtonHandler` already listens for.

**A Discord outage must answer 503, not 403.** Only error code 10007 (Unknown
Member) means "not a member"; treating any other failure that way would lock
every user out of their own server during an outage.

**`getGuildLimits` returns `Infinity` for premium**, which `JSON.stringify` turns
into `null`. `/context` converts it explicitly so the front end does not read a
paying server as having no allowance.

## Gating, and where it differs from Discord

"CAD configured" is `RoleplayCommands.enabled` — `CADConfig.enabled` exists but
nothing reads it. LEO additionally needs `CADConfig.leoRoleIds` non-empty and the
member holding one, or being staff, which is what `/leodatabase` allows.

The CAD also honours `CADConfig.staffRoleIds` (set under "Set Staff Roles" in CAD
setup). Discord's `/leodatabase` ignores that field entirely — a real
inconsistency on the Discord side, not a bug here.

Roles are cached per user+guild for 5 minutes; `guildMemberUpdate` in
`src/index.js` calls `clearCadCaches(userId)` so a newly granted role applies at
once. See [[interval-db-guards]] for the SSE poller's `readyState` guard.

## Environment

`CAD_DOMAIN` — when set, the CAD is served at the root path on that host and the
OAuth redirect URI is built from it. `CAD_SECRET` — signs sessions; falls back to
`PORTAL_SECRET` then `DISCORD_CLIENT_SECRET`, and **fails closed** if none is
set. `<origin>/cad/callback` must be registered in the Discord Developer Portal
for every origin the CAD is reachable on.
