---
name: Web CAD
description: Multi-tenant CAD at /cad; tenancy via resolveGuild; call IDs must end in a number; panic must write panicAnnounced false.
---

# Web CAD

The page is on Cloudflare Pages at roleplaymanager.xyz/cad
(`site/cad/index.html`) and also on Koyeb at /cad (`src/website/views/cad.html`).
The two differ only in the `window.CAD_API` they set, and both load the CSS and
JS from the Koyeb origin — one copy of the front end, not two.

- `routes/cadAuth.js` — bearer-token auth. **Not a cookie**: the page and API are
  cross-site, so a cookie would be third-party and Safari blocks those outright.
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

## Sign-in needs no new setup

The CAD signs in through **`/auth/site/callback`** — the dashboard's callback,
already registered with Discord and already requesting `identify guilds`. Adding
a redirect URI is therefore never necessary. The token returns in the fragment of
the URL passed as `state`, which `src/index.js` checks against an origin
allow-list before redirecting.

The token then lives in localStorage, readable by page JavaScript. That is the
cost of working cross-site, and the reason the escaping above is not optional.

## SSE cannot use a header

`EventSource` sends no Authorization header, and the access token must not go in
a query string where it would land in every access log. So the browser asks for a
one-shot ticket first: single use, 60 seconds, bound to one guild, and it opens
nothing but a read-only stream. Because redemption spends it, the browser's own
retry is suppressed and a fresh ticket is fetched instead.

## Environment

None required. `CAD_DOMAIN` is optional, and only matters if the CAD is ever
given its own subdomain — it is then served at that host's root path.
