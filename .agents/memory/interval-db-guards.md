---
name: Scheduled DB Query Guards
description: Every setInterval that touches MongoDB must check mongoose.connection.readyState first; list of which intervals are DB vs in-memory.
---

# Scheduled DB Query Guards

Every `setInterval` whose callback queries MongoDB must open with:

```js
if (mongoose.connection.readyState !== 1) return;
```

**Why:** MongoDB drops on Replit and can drop briefly on Koyeb. Without the guard each timer keeps firing queries against a dead connection, and every cycle throws into the `catch` and logs. The per-guild pollers are the worst case — panic and 911 poll every 5s *per guild*, so an outage with 20 guilds produces hundreds of error lines a minute and buries real logs.

**The 8 DB intervals (all guarded as of Sep 2026):**
- `src/index.js` — 911 expired-call cleanup (60s), BOLO cleanup (5min), business income (15min), loan reminders (1h), + 3 more in the same block
- `src/handlers/dispatchHandler.js` — `startTrafficStopCheckTimer` (60s/guild), `startCallRepeatTimer` (60s/guild), plus `startStatusReminderTimer` and `startHourlyStatusReset` which are currently dormant (defined but never called — status TTS prompts were disabled per staff feedback)
- `src/utils/voiceListener.js` — `_startPanicPoller` (5s/guild), `start911Poller` (5s/guild)

**Do NOT add the guard to these — they are in-memory only:**
`src/index.js:177` (API rate-limit map prune), `src/website/routes/api.js:39` (admin/me cache prune), `src/website/routes/checkout.js:14` (rate-limit prune), `src/website/routes/dev.js:45` (login-attempt prune), `portal/routes/api.js:1288` (SSE heartbeat write). Anything in `public/js/` is browser-side.

**How to audit:** grep every `setInterval(` under `src/` and `portal/` excluding `public/js`, then read ~14 lines of each callback for a `readyState` check. See [[deployment-architecture]] for why the connection is unreliable in the first place.

**Related open issue:** there is no `guildDelete` listener, so the per-guild timers in `dispatchHandler.js` and `voiceListener.js` are never cleared when the bot is removed from a guild. `startCallRepeatTimer` has no `stop` counterpart at all. The readyState guard limits the noise but does not stop the leak.
