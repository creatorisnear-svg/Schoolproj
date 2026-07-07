# RolePlayManager Discord Bot

## Overview
RolePlayManager is a Discord bot for multi-server GTA5 RP communities. It handles emergency reporting (911), member verification, staff management, strike system, priority tracking, RP calendar, sticky messages, anti-promoting, reaction roles, role requests, economy, civilian jobs, voice mover, AI voice dispatch, and a civilian/LEO web portal. Each server gets its own independent configuration stored in MongoDB.

---

## User Preferences
- All bot responses must use Discord embeds
- Minimalist UI: all embeds use `#2d2d2d` color (except Priority Tracker: red while active, orange while on cooldown), footer `RPM`, no emojis anywhere
- Discord markdown formatting (`### headers`, `-# subtext`, `` `code blocks` ``) preferred
- MongoDB for all persistent data storage
- Staff and Admins have full access to all commands; general members restricted to roleplay/verification commands only
- Dashboard design: dark theme, minimalist, no emojis, `--accent` #5865f2

---

## CRITICAL — Read Before Editing Anything

1. **Two dashboards exist — always edit `site/`, not `src/website/public/`.**

   | File | Served by | Who sees it |
   |------|-----------|-------------|
   | `site/js/dashboard.js` + `site/css/style.css` | Cloudflare Pages | All users at roleplaymanager.xyz — **edit this one** |
   | `src/website/public/js/dashboard.js` + `.../style.css` | Koyeb Express | Legacy/secondary, rarely needed |

   Same rule for the dev panel: `roleplaymanager.xyz/dev` is served from **`site/dev/index.html`** (Cloudflare Pages), NOT `src/website/views/devpanel.html` (Koyeb-only). The dev panel calls the Koyeb API (`API_BASE` in that file) with `Authorization: Bearer <DEV_PASSWORD>`.

2. **Replit is dev-only.** Changes must be pushed to GitHub to reach production — Cloudflare Pages auto-deploys in ~30s, Koyeb takes ~2min. The bot may not connect to MongoDB/Discord properly inside Replit itself.

3. **Every Mongoose model must use the guard pattern**, or ESM dynamic re-imports throw "Cannot overwrite model once compiled" in production:
   ```js
   export default mongoose.models.ModelName || mongoose.model('ModelName', schema);
   ```

4. **Never remove the Replit UDP bypass** in `src/utils/voiceListener.js`. Discord voice servers never reply to UDP from Replit (inbound blocked), so `@discordjs/voice`'s `performIPDiscovery()` hangs forever. The bypass intercepts `net.stateChange` at code 2 and emits a synthetic 74-byte fake IP discovery response. Without it, voice connections hang at `connecting` forever on Replit. (Outbound TTS UDP works fine — only inbound is blocked.)

5. **MongoDB may disconnect on Replit.** Any timed interval that queries MongoDB should guard with `if (mongoose.connection.readyState !== 1) return;` to avoid log spam / errors when the connection drops (see the Civilian Jobs expiry interval in `src/index.js`).

6. **`@discordjs/voice` must stay ≥ `0.19.2`** for DAVE (Discord Audio/Video E2E Encryption) support — older versions get rejected with close code 4017. `@snazzah/davey` is a required peer dependency.

---

## Deployment Architecture

```
GitHub repo (single codebase)
  ├── Koyeb Instance → Bot + API server (npm start → src/index.js), PORT=8000
  │     Portal also mounted here at /portal
  └── Cloudflare Pages → Static site (site/ directory)
        Auto-deploys on GitHub push, custom domain roleplaymanager.xyz
```

- **Bot + API**: Koyeb, `npm start` → `src/index.js`, Express on port 8000
- **Static site**: Cloudflare Pages, `site/` directory, no build step, auto-deploys
- **Portal**: same Koyeb instance as the bot, mounted at `/portal`
- **Database**: MongoDB Atlas, shared across everything

### Required Environment Variables (set on Koyeb)
```
DISCORD_TOKEN          - Bot token
DISCORD_CLIENT_ID      - OAuth2 client ID
DISCORD_CLIENT_SECRET  - OAuth2 client secret
MONGODB_URI            - MongoDB Atlas connection string
OPENAI_API_KEY         - Whisper + GPT-4o-mini for AI dispatch
STRIPE_SECRET_KEY      - Stripe payments
STRIPE_WEBHOOK_SECRET  - Stripe webhook verification
SITE_ORIGIN            - https://roleplaymanager.xyz (CORS whitelist)
DOMAIN                 - koyeb hostname for OAuth2 redirect URLs
PORT                   - 8000 on Koyeb, 5000 locally
PORTAL_GUILD_ID        - Discord server ID for the portal
PORTAL_DOMAIN          - Portal domain for cookies
BOT_INTERNAL_URL       - Optional: direct bot trigger URL for portal panic
DEV_PASSWORD           - Password for /dev admin panel
TOPGG_BOT_ID           - Bot's Discord user ID (public, for top.gg vote URL)
TOPGG_WEBHOOK_SECRET   - Secret set in top.gg dashboard to verify incoming vote webhooks
```

---

## Bot Architecture

- **Entry point**: `src/index.js` — connects to MongoDB, logs into Discord, starts Express server, loads all handlers, registers slash commands.
- **Handlers** (`src/handlers/`): `economyHandler.js`, `economyActions.js`, `dispatchHandler.js`, `verifyHandler.js`, `strikeHandler.js`, `ticketHandler.js`, `appyHandler.js`, `setupWizardHandler.js` (handles `setup_config_select` interactions from `/setup`), etc.
- **Models** (`src/models/`): `Announcement`, `AuthorizedUser`, `AutoJoin`, `AutoRole`, `BOLO`, `CADCharacter`, `CADConfig`, `Changelog`, `CivilianJobConfig`, `Config`, `DispatchConfig`, `EconomyBalance`, `EconomyConfig`, `EconomyInventory`, `EconomyStore`, `EmergencyCall`, `FeatureFlag`, `JobAssignment`, `MemberMovementConfig`, `OfficerStatus`, `PendingVerification`, `PremiumKey`, `PreviewVideo`, `Priority`, `PriorityRequest`, `ReactionRole`, `RoleplayCalendar`, `RoleplayCommands`, `RoleRequestConfig`, `RoleRequest`, `Staff`, `StatusHeartbeat`, `Sticky`, `Strike`, `StripeConfig`, `TicketConfig`, `Ticket`, `TrafficTicket`, `Verification`, `Welcome`, `AppyConfig`, `AppyPanel`, `AppySubmission`
- **Utilities** (`src/utils/`): `premiumCheck.js` (`checkFeatureAccess`, `isPremiumGuild`, `clearPremiumCache`, `clearFeatureFlagCache`, cached 5 min), `embedBuilder.js` (`successEmbed`/`errorEmbed`), `permissions.js` (`checkStaffPermission`), `voiceListener.js` (AI dispatch voice pipeline + UDP bypass, see Critical section)
- **Slash commands** (`src/commands/`), registered globally:
  - **Setup & Config (new)**: `/setup` (server status dashboard + jump-to-feature wizard), `/config <module>` (unified config replacing all individual xxxconfig commands — subcommands: `general`, `features`, `verify`, `tickets`, `economy`, `strikes`, `welcome`, `antipromo`, `roles`, `priority`, `calendar`, `moveme`, `roleplay`, `appys`, `dispatch`)
  - **Legacy config** (still work, show a hint pointing to `/config`): `/verifysystemconfig`, `/ticketsupportconfig`, `/strikesystemconfig`, `/welcomesystemconfig`, `/antipromotingconfig`, `/movemeconfig`, `/rolerequestadd`, `/dispatchconfig`, `/economyconfig`, `/roleplaycommandconfig`, `/prioritytrackerconfig`, `/roleplaycalenderconfig`, `/appyconfig`
  - **Databases**: `/civiliandatabase`, `/leodatabase`, `/firedepartmentdatabase`
  - **Staff & Permissions**: `/staff`, `/setlogchannel`, `/enablecommands`, `/reloadconfig`
  - **Economy** (member commands): `/balance`, `/work`, `/crime`, `/rob`, `/gamble`, `/shop`, `/buy`, `/sell`, `/inventory`, `/give`, `/giveitems`, `/deposit`, `/withdraw`, `/leaderboard`, `/income`, `/use`
  - **RP**: `/setrp`, `/unsetrp`, `/activepriority`, `/deactivatepriority`, `/priorityrequest`, `/rolerequest`
  - **Premium**: `/activatepremium`, `/activatetrial`, `/premium`
  - **Misc**: `/help`, `/clear`, `/embed`, `/strike`, `/removestrike`, `/blacklist`, `/removeblacklist`, `/sticky`, `/stickylist`, `/invite`, `/manageroles`, `/dev`

---

## Feature Details

- **Permissions**: Discord `Administrator` = full access; `Staff` model = staff access; general members = roleplay/verification commands only.
- **Feature flags**: `FeatureFlag` model marks premium-gated features. `GET /api/public/features` (public), `PATCH /dev/features/:feature` (dev-password protected). Default: only `dispatch` and `appys` are premium.
- **Premium**: `PremiumKey` model, locked to one guild. Free limits: 100 characters, 200 vehicles, 100 firearms, 20 BOLOs. `/activatepremium <key>` or Stripe checkout. Cached 5 min; `clearPremiumCache(guildId)` busts immediately.
- **Logging**: `/setlogchannel` sets a guild log channel (`Config` model); most moderation actions post there.
- **AI Voice Dispatch**: Officers speak in patrol voice channels → Whisper transcription → GPT-4o-mini dispatcher reply. Parses 10-codes (10-4, 10-8, 10-11, 10-80, 10-99 panic). Voice CAD queries ("dispatch, run plate/name [X]"). Live status board embed + 911 repeat announcements every 2 min. Configured via `/dispatchsetup`; requires `OPENAI_API_KEY`. Models: `DispatchConfig`, `OfficerStatus`.
- **Economy**: `EconomyConfig` per guild. Cash/bank (`EconomyBalance`), work/crime/rob, gambling (blackjack, roulette, slots, dice, russian roulette, cockfight), role income, chat money, store + inventory (`EconomyStore`, `EconomyInventory`). ~140 built-in GTA V vehicles (`src/data/gtaVehicles.js`), merged at display time (not seeded to DB).
- **Civilian Jobs**: `CivilianJobConfig` (jobs list + job board channel), `JobAssignment` (active assignments with `expiresAt`). Job board panel via buttons; role auto-removed after `durationHours` via interval in `src/index.js`.
- **Voice Mover**: `MemberMovementConfig` (`enabled`, `panelChannelId`, `allowedChannelIds`). Members click a panel button to self-move between allowed voice channels.
- **Applications (Appys)** — premium: `AppyConfig`/`AppyPanel`/`AppySubmission` models. Staff define application types (name, description, questions[], optional acceptRoleId) and send a panel (bot or webhook). Members pick a type from a select menu → bot DMs questions one-by-one (10 min inactivity timeout, blocks re-apply while pending) → submission posted with Accept/Deny buttons → user DM'd + role assigned on accept. Routing lives in `src/handlers/appyHandler.js`; DMs routed via `messageCreate` in `src/index.js`.
- **Verification**: customizable RP tags, questions, welcome message, role assignment via a panel + modal.
- **Strikes**: 4 levels, configurable punishments (role, kick, timeout, ban).
- **Tickets**: custom types (5 free / unlimited premium), button panel → modal → private channel. Types reload from MongoDB per submission to avoid session-expiry bugs.
- **Anti-Promoting**: removes non-whitelisted Discord invite links; per-guild whitelist; staff bypass.
- **Reaction Roles**: up to 5 emoji-role pairs per message.
- **Sticky Messages**: reposts a configured message after every new message, prefixed `__**Stickied Message:**__`.

---

## Website & Dashboard (Cloudflare Pages, `site/`)

```
site/
  index.html      - Landing page
  dashboard.html  - Dashboard SPA
  dev/index.html  - Dev panel (see Critical section)
  js/dashboard.js - ALL dashboard logic
  css/style.css   - Dashboard + landing styles
  img/logo.png
```

- **Auth flow**: Discord OAuth2 → `/auth/site/callback` (Koyeb) → JWT via redirect to `roleplaymanager.xyz/dashboard/#token=<token>` → `dashboard.js` stores it in `localStorage.dash_token` → all API calls send `Authorization: Bearer <dash_token>`.
- **Session persistence**: `dashboard.js` saves `rpm_guild_id`/`rpm_section` in `localStorage` (survives reloads, tab closes, OAuth re-auth). Functions: `saveSession`, `clearSession`, `getSavedGuildId`, `getSavedSection`. `renderServerSelect()` clears session on server switch.
- **Loading UI**: `fullPageLoader(msg)` (spinner on init/server select), `settingsSkeletonLoader()` (shimmer while settings load).
- **Sidebar groups**: Roleplay (Roleplay Commands, Priority Tracker, RP Calendar), Moderation (Verification, Strikes, Anti-Promoting), Community (Tickets, Welcome, Role Request, Voice Mover, Applications), Economy (Economy, Civilian Jobs), Advanced (AI Voice Dispatch, General Settings).
- **Settings pages** all render via `renderSettings(mod)` → `GET /api/guild/:id/settings/:mod`. Modules: `general`, `roleplay`, `verification`, `strikes`, `tickets`, `welcome`, `antipromo`, `rolerequest`, `priority`, `calendar`, `economy`, `moveme`, `civjobs`, `dispatch`, `appys`, `staff`.
- **Key functions**: `api(path, opts)`, `renderSettings(mod)`, module-specific renderers (`renderMovemeSettings`, `renderCivJobsSettings`, `renderEconomySettings`, `renderRoleRequestSettings`, `renderDispatchExtras`, `renderAppySettings`), `showSaveBar(mod)` / `saveSettings(mod)` (pending-changes save bar), `toggleFeature(el)` (handles premium blocking).
- **API base URL**: hardcoded in `site/js/dashboard.js` as `API_BASE` = `https://severe-daryl-officialplaystation5-0f1738f5.koyeb.app`.

---

## Koyeb API Server (`src/website/routes/`)

- **Auth** (`auth.js`): `GET /auth/site/callback` (static site OAuth2 → JWT), `GET /dashboard/callback` (legacy Koyeb-served dashboard). Verifies tokens via Discord `/users/@me`.
- **API** (`api.js`), all prefixed `/api/`. Auth via `getToken(req)` — `dash_token` cookie or `Authorization: Bearer`.
  - `GET /api/me`, `GET /api/guild/:id`
  - `GET/POST /api/guild/:id/settings/:mod` (see module list above)
  - `POST /api/guild/:id/feature/:feature`, `GET /api/public/features`
  - Module CRUD: tickets types/panel, verification panel, moveme panel, calendar events/post, antipromo links, rolerequest roles, economy store/roleincome, civjobs job (requires `name`, `roleId`, `durationHours`), staff add, appys type/panel (see Appys feature above)
  - Dev endpoints (DEV_PASSWORD protected): `GET/PATCH /dev/features*`, `/dev` panel

---

## Portal (Civ/LEO Web App, `portal/`)

- Express SPA mounted at `/portal` on the same Koyeb instance as the bot. Entry: `portal/server.js` (imports `src/index.js` for the shared bot client).
- **Auth**: Discord OAuth2 → HMAC-signed `portal_session` cookie (`portal/routes/auth.js`), callback at `/portal/auth/callback`. All API routes under `/api/portal/*` require `portalAuth` middleware.
- **Frontend**: `portal/views/portal.html` (shell), `portal/public/js/portal-app.js` (SPA logic), `portal/public/css/portal.css` (dark theme: `--surface`/`--card`/`--elevated`, `--accent` #5865f2, `--danger` red, `--warning` amber, `var(--radius)` 10px, no emojis).
- **Modes**: Civilian (default) vs LEO (requires LEO Discord role, `isLeo: true`); stored in `localStorage.portalMode`.
- **Key API routes** (`/api/portal/`): `GET /me`, `GET/POST/DELETE /characters`, `GET/POST /vehicles`, `GET /officers/overview`, `GET /voice/channels`, `POST /voice/move`, `GET /civjobs`, `POST /civjobs/checkin/:jobId` + `checkout`, `POST /emergency`, `GET /priority`.
- **Priority status**: civilians and LEOs both poll `GET /priority` every 5s via `startGlobalPriorityPoll()` in `portal-app.js`, which updates the global bar, the Overview widget, and the Priority tab immediately on change, and fires a browser push notification (`fireBrowserNotification`) the moment priority goes active or enters cooldown.
- **Panic button flow**: portal upserts `OfficerStatus` with `tenCode: '10-99', panicAnnounced: false`. Bot's `voiceListener.js` runs `_startPanicPoller` every 5s for any guild with dispatch configured, finds unannounced panics, and fires TTS + embed in the dispatch channel. Optional direct trigger via `BOT_INTERNAL_URL/internal/panic`.

---

## Stripe / Payments (`src/website/routes/checkout.js`)

- Monthly subscription: `mode: 'subscription'` (auto-creates Stripe customer — do NOT pass `customer_creation`).
- Lifetime: `mode: 'payment'` + `customer_creation: 'always'`.
- Webhooks: `checkout.session.completed` → creates `PremiumKey`; `customer.subscription.deleted` + `invoice.payment_failed` → marks expired + clears premium cache.
- `STRIPE_WEBHOOK_SECRET` required for key-creation webhook; lifecycle events work without it.

---

## External Dependencies
- **discord.js v14** - Discord API client
- **@discordjs/voice 0.19.2+** - Voice (DAVE encryption)
- **@snazzah/davey** - DAVE E2E encryption (peer dep of @discordjs/voice)
- **opusscript** - Pure-JS Opus codec for audio receiving
- **prism-media** - Opus → PCM decoding
- **openai** - Whisper transcription + GPT-4o-mini dispatch responses
- **mongoose** - MongoDB ODM
- **express** - HTTP server + API
- **cookie-parser** - Cookie auth for portal
- **stripe** - Payment processing
- **dotenv** - Environment variables
- **uuid** - Unique ID generation
