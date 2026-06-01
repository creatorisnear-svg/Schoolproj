# RolePlayManager Discord Bot

## Overview
RolePlayManager is a Discord bot for multi-server GTA5 RP communities. It handles emergency reporting (911), member verification, staff management, strike system, priority tracking, RP calendar, sticky messages, anti-promoting, reaction roles, role requests, economy, civilian jobs, voice mover, AI voice dispatch, and a civilian/LEO web portal. Each server gets its own independent configuration stored in MongoDB.

---

## User Preferences
- All bot responses must use Discord embeds
- Minimalist UI: all embeds use `#2d2d2d` color, footer `RPM`, no emojis anywhere
- Discord markdown formatting (`### headers`, `-# subtext`, `` `code blocks` ``) preferred
- MongoDB for all persistent data storage
- Staff and Admins have full access to all commands; general members restricted to roleplay/verification commands only
- Dashboard design: dark theme, minimalist, no emojis, `--accent` #5865f2

---

## Deployment Architecture

### Where Things Run
```
GitHub repo (single codebase)
  ├── Koyeb Instance 1 → Bot + API server (npm start)
  │     PORT=8000, all src/ code, Express API at /api/*
  └── Cloudflare Pages → Static site (site/ directory)
        Auto-deploys on GitHub push, custom domain roleplaymanager.xyz
```

- **Bot + API**: Koyeb, `npm start` → `src/index.js`, Express on port 8000
- **Static site**: Cloudflare Pages, `site/` directory, no build step, auto-deploys
- **Database**: MongoDB Atlas, shared between both Koyeb instances
- **Portal**: Runs on same Koyeb instance as bot, mounted at `/portal`
- **Replit**: Development environment only — bot may not connect to MongoDB/Discord properly here

### Required Environment Variables (set on Koyeb)
```
DISCORD_TOKEN          — Bot token
DISCORD_CLIENT_ID      — OAuth2 client ID
DISCORD_CLIENT_SECRET  — OAuth2 client secret
MONGODB_URI            — MongoDB Atlas connection string
OPENAI_API_KEY         — Whisper + GPT-4o-mini for AI dispatch
STRIPE_SECRET_KEY      — Stripe payments
STRIPE_WEBHOOK_SECRET  — Stripe webhook verification
SITE_ORIGIN            — https://roleplaymanager.xyz (CORS whitelist)
DOMAIN                 — koyeb hostname for OAuth2 redirect URLs
PORT                   — 8000 on Koyeb, 5000 locally
PORTAL_GUILD_ID        — Discord server ID for the portal
PORTAL_DOMAIN          — Portal domain for cookies
BOT_INTERNAL_URL       — Optional: direct bot trigger URL for portal panic
DEV_PASSWORD           — Password for /dev admin panel
```

---

## CRITICAL: Two Separate Dashboard Files

**This is the most important thing for any AI working on this project.**

There are TWO completely separate dashboard implementations:

| File | Served by | Who sees it | Edit for |
|------|-----------|-------------|----------|
| `site/js/dashboard.js` + `site/css/style.css` | Cloudflare Pages | All users at roleplaymanager.xyz | **User-facing changes** |
| `src/website/public/js/dashboard.js` + `src/website/public/css/style.css` | Koyeb Express | Direct API server access only | Rarely needed |

**Always edit `site/` for anything the user sees in their browser.**
The Koyeb dashboard (`src/website/public/`) is a secondary/legacy version. `site/` is the live production dashboard.

---

## Bot Architecture

### Entry Point
`src/index.js` — connects to MongoDB, logs into Discord, starts Express server, loads all handlers, registers slash commands.

### Command Handlers (`src/handlers/`)
- `economyHandler.js` — Economy system, civilian jobs, store, income
- `economyActions.js` — Economy action execution (work, crime, gamble, etc.)
- `dispatchHandler.js` — AI voice dispatch interactions
- `verifyHandler.js`, `strikeHandler.js`, `ticketHandler.js`, etc.

### Models (`src/models/`)
All Mongoose models. Every model MUST use the guard pattern:
```js
export default mongoose.models.ModelName || mongoose.model('ModelName', schema);
```
Known models: `Announcement`, `AuthorizedUser`, `AutoJoin`, `AutoRole`, `BOLO`, `CADCharacter`, `CADConfig`, `Changelog`, `CivilianJobConfig`, `Config`, `DispatchConfig`, `EconomyBalance`, `EconomyConfig`, `EconomyInventory`, `EconomyStore`, `EmergencyCall`, `FeatureFlag`, `JobAssignment`, `MemberMovementConfig`, `OfficerStatus`, `PendingVerification`, `PremiumKey`, `PreviewVideo`, `Priority`, `PriorityRequest`, `ReactionRole`, `RoleplayCalendar`, `RoleplayCommands`, `RoleRequestConfig`, `RoleRequest`, `Staff`, `StatusHeartbeat`, `Sticky`, `Strike`, `StripeConfig`, `TicketConfig`, `Ticket`, `TrafficTicket`, `Verification`, `Welcome`

### Utilities (`src/utils/`)
- `premiumCheck.js` — `checkFeatureAccess(guildId, featureKey)`, `isPremiumGuild(guildId)`, `clearPremiumCache()`, `clearFeatureFlagCache()`. Results cached 5 minutes.
- `embedBuilder.js` — `successEmbed`, `errorEmbed`, standard embed helpers
- `permissions.js` — `checkStaffPermission`
- `voiceListener.js` — AI dispatch voice pipeline + **CRITICAL Replit UDP bypass** (see below)

### Slash Commands (`src/commands/`)
All commands registered globally. Key commands:
- `/economysetup` — Economy admin panel (dropdown with all economy config options)
- `/civiliandatabase`, `/leodatabase`, `/firedepartmentdatabase` — Roleplay command menus
- `/dispatchsetup` — AI dispatch configuration (admin only)
- `/dev` — Developer control panel (protected by DEV_PASSWORD)
- `/activatepremium` — Activate premium key for a server
- Member economy: `/balance`, `/work`, `/crime`, `/rob`, `/gamble`, `/shop`, `/buy`, `/sell`, `/inventory`, `/give`, `/giveitems`, `/deposit`, `/withdraw`, `/leaderboard`, `/income`, `/use`

---

## Feature Details

### Permission System
- Discord `Administrator` flag = full access
- Staff database (`Staff` model) = staff access
- General members = roleplay/verification commands only

### Feature Flag System
- MongoDB `FeatureFlag` model stores which features are premium-gated
- `GET /api/public/features` — public map of `{ featureKey: isPremium }`
- `PATCH /dev/features/:feature` — toggle premium status (dev password protected)
- Default: `dispatch` is premium; everything else free unless set in DB
- Dashboard fetches flags on load and shows Premium badges + blocks enabling premium features without a key

### Premium System
- Keys stored in `PremiumKey` model, lock to one guild
- Free limits: 100 characters, 200 vehicles, 100 firearms, 20 BOLOs
- AI Voice Dispatch requires premium
- `/activatepremium <key>` in Discord, or via Stripe checkout on website
- Checks cached 5 minutes; `clearPremiumCache(guildId)` to bust immediately

### Logging System
- `/setlogchannel` sets a guild log channel (`Config` model)
- Most moderation actions post to the log channel

### AI Voice Dispatch
- Officers speak in patrol voice channels; bot transcribes with Whisper, generates dispatcher reply with GPT-4o-mini
- 10-codes parsed: 10-4, 10-8, 10-11, 10-80, 10-99 (panic), etc.
- CAD voice queries: "dispatch, run plate [X]" or "dispatch, run name [X]"
- Status board: live embed showing officer statuses + active 911 calls
- 911 call repeat announcements every 2 minutes for unresponded calls
- Configured per-guild via `/dispatchsetup`; requires `OPENAI_API_KEY`
- Models: `DispatchConfig`, `OfficerStatus`

### CRITICAL: Replit UDP Bypass (voiceListener.js)
Discord's voice servers never reply to UDP from Replit (inbound UDP blocked). `@discordjs/voice` calls `performIPDiscovery()` which hangs forever. Fix: intercept `net.stateChange` at code 2 and emit a synthetic 74-byte fake IP discovery response on the dgram socket. **Never remove this bypass** — without it voice hangs at `connecting` forever. TTS outbound UDP works fine (only inbound blocked).

### Economy System
Full currency economy. `EconomyConfig` stores per-guild settings. Key mechanics:
- Cash + bank balance (`EconomyBalance`)
- Work/crime with configurable success rates and payouts
- Robbery between members
- Gambling (blackjack, roulette, slots, dice, russian roulette, cockfight)
- Role income (periodic payouts for role holders)
- Chat money (earn small amounts by chatting)
- Store + inventory (`EconomyStore`, `EconomyInventory`)
- ~140 GTA V built-in vehicles in shop (`src/data/gtaVehicles.js`) — merged at display time, no DB seeding

### Civilian Jobs
- `CivilianJobConfig` — stores guild jobs list + job board channel
- `JobAssignment` — tracks active role assignments with `expiresAt`
- Job board panel posted to Discord channel via button interactions
- Role auto-removed after `durationHours` expires (interval in `src/index.js`)
- **Bug fix (June 2026):** expiry interval now checks `mongoose.connection.readyState === 1` before querying to prevent log spam when MongoDB is disconnecting

### Voice Mover (Member Self-Move)
- `MemberMovementConfig` — stores `enabled`, `panelChannelId`, `allowedChannelIds`
- Members click a panel button to see available voice channels and move themselves
- Panel posted via Discord bot; configured via dashboard
- API: `GET/POST /api/guild/:id/settings/moveme`, `POST /api/guild/:id/settings/moveme/panel/send`

### Verification System
Customizable RP tags, questions, welcome messages, role assignment. Panel posted to a channel; members click to open a verification modal.

### Strike System
Multi-level (1-4) with configurable actions: role assignment, kick, timeout, ban.

### Ticket Support
Custom ticket types (up to 5 free, unlimited premium). Each type = button on panel. Modal opens on button click, creates a private channel. Types reload from MongoDB on each submit (prevents session expiry bugs).

### Anti-Promoting
Detects non-whitelisted Discord invite links, removes them. Whitelisted links stored per-guild. Staff bypass available.

### Reaction Roles
Up to 5 emoji-role pairs per message, configurable for any message.

### Sticky Messages
Auto-reposts configured message after every new message in the channel with `__**Stickied Message:**__` prefix.

---

## Website & Dashboard (Cloudflare Pages)

### File Structure (`site/`)
```
site/
  index.html           — Landing page
  dashboard.html       — Dashboard SPA
  js/
    dashboard.js       — ALL dashboard logic (1700+ lines)
  css/
    style.css          — Dashboard + landing styles
  img/
    logo.png           — Bot logo
```

### Authentication Flow
1. User clicks Login → redirects to Discord OAuth2
2. Discord redirects to `https://{DOMAIN}/auth/site/callback`
3. Koyeb API creates JWT, redirects to `roleplaymanager.xyz/dashboard/#token=<token>`
4. `dashboard.js` extracts token from hash, stores in `localStorage` as `dash_token`
5. All API calls use `Authorization: Bearer <dash_token>` header

### Session Persistence (refresh fix)
`dashboard.js` uses `sessionStorage` to save `rpm_guild_id` and `rpm_section`. On page load, `init()` checks for a saved guild ID and jumps straight back to the last-viewed settings page instead of showing the server selector. Functions: `saveSession(guildId, section)`, `clearSession()`, `getSavedGuildId()`, `getSavedSection()`.

### Loading Screens
- `fullPageLoader(msg)` — animated spinner with pulsing logo, used on init and server select
- `settingsSkeletonLoader()` — shimmer skeleton rows while settings API loads
- CSS classes in `site/css/style.css`: `.rpm-loader`, `.rpm-spinner`, `.rpm-loader-dots`, `.skeleton`, `.skeleton-section`, `.sk-line`, `.sk-box`

### Dashboard Sections
**Overview page:** Enable/disable feature toggles for all modules, Configure Modules grid (click any card to open settings).

**Sidebar groups:**
- Roleplay: Roleplay Commands, Priority Tracker, RP Calendar
- Moderation: Verification, Strike System, Anti-Promoting
- Community: Ticket Support, Welcome System, Role Request, **Voice Mover**
- Economy: Economy, **Civilian Jobs**
- Advanced: AI Voice Dispatch, General Settings

**Settings pages (all via `renderSettings(mod)`):**
- `general` — log channel, general config
- `roleplay` — 911, CAD, Twitter, anon channels
- `verification` — gate channel, roles, questions; "Send Panel" button
- `strikes` — levels 1-4, punishments, channels
- `tickets` — ticket types CRUD + panel send (type picker)
- `welcome` — channel + DM embed config
- `antipromo` — whitelisted links CRUD
- `rolerequest` — requestable roles CRUD (with approver roles)
- `priority` — priority event channel, cooldown
- `calendar` — scheduled events CRUD + "Post Calendar" button
- `economy` — grouped settings (general/work/crime/rob/gambling/chatmoney) + Role Income CRUD + Store Items CRUD
- `moveme` — enabled toggle + panel channel + allowed voice channels list + "Send Panel" button
- `civjobs` — job board channel + jobs CRUD (name, role required, shift duration required)
- `dispatch` — AI config + patrol/traffic/LEO channel management

### Key Dashboard Functions (`site/js/dashboard.js`)
- `api(path, opts)` — all API calls with Bearer auth, base URL = Koyeb API
- `renderSettings(mod)` — fetches `GET /api/guild/:id/settings/:mod`, renders the appropriate section
- `renderMovemeSettings(data)` — renders Voice Mover settings + channel picker + panel button
- `renderCivJobsSettings(data)` — renders Civilian Jobs settings + jobs list CRUD
- `renderEconomySettings(data)` — grouped economy fields + Role Income CRUD + Store Items CRUD
- `renderRoleRequestSettings(data)` — requestable roles list CRUD
- `renderDispatchExtras(data)` — patrol/traffic/LEO channel management UI
- `showSaveBar(mod)` — shows fixed bottom save/discard bar
- `saveSettings(mod)` — POSTs `pendingChanges` to API
- `toggleFeature(el)` — enables/disables a module, handles premium blocking

### API Base URL
`https://severe-daryl-officialplaystation5-0f1738f5.koyeb.app` (hardcoded in `site/js/dashboard.js` as `API_BASE`)

---

## Koyeb API Server (`src/website/routes/`)

### Auth (`auth.js`)
- `GET /auth/site/callback` — OAuth2 callback for static site, returns JWT via redirect
- `GET /dashboard/callback` — OAuth2 callback for Koyeb-served dashboard (legacy)
- Token verification via Discord `/users/@me`

### API (`api.js`)
All routes prefixed `/api/`. Auth: `getToken(req)` checks `dash_token` cookie OR `Authorization: Bearer` header.

**Guild info:**
- `GET /api/me` — current user + admin guilds where bot is present
- `GET /api/guild/:id` — guild info + config + premium status

**Settings (all modules):**
- `GET /api/guild/:id/settings/:mod` — get module config + fields for dashboard rendering
  - Modules: `general`, `roleplay`, `verification`, `strikes`, `tickets`, `welcome`, `antipromo`, `rolerequest`, `priority`, `calendar`, `economy`, `dispatch`, `moveme`, `civjobs`, `staff`
- `POST /api/guild/:id/settings/:mod` — save module settings (whitelists allowed fields per module)

**Feature toggles:**
- `POST /api/guild/:id/feature/:feature` — enable/disable a module (blocks premium features if no key)
- `GET /api/public/features` — public feature flag map (no auth)

**Module-specific CRUD:**
- `POST /api/guild/:id/settings/tickets/types` + `DELETE .../types/:typeId`
- `POST /api/guild/:id/settings/tickets/panel/send`
- `POST /api/guild/:id/settings/tickets/panel/send` with `{ typeIds }`
- `POST /api/guild/:id/settings/verification/panel/send`
- `POST /api/guild/:id/settings/moveme/panel/send`
- `POST /api/guild/:id/settings/calendar/events` + `DELETE .../events/:eventId`
- `POST /api/guild/:id/settings/calendar/post`
- `POST /api/guild/:id/settings/antipromo/links` + `DELETE .../links`
- `POST /api/guild/:id/rolerequest/roles` + `DELETE .../roles/:roleId`
- `GET /api/guild/:id/economy/store` + `POST` + `DELETE .../store/:itemId`
- `POST /api/guild/:id/economy/roleincome` + `DELETE .../roleincome/:roleId`
- `POST /api/guild/:id/civjobs/job` — add job (`name`, `description`, `roleId` required, `durationHours` required)
- `DELETE /api/guild/:id/civjobs/job/:jobId`
- `POST /api/guild/:id/staff/add` + `DELETE .../staff/:id`

**Dev endpoints (DEV_PASSWORD protected):**
- `GET /dev/features`, `PATCH /dev/features/:feature`
- `/dev` panel for bot management

---

## Portal (Civ/LEO Web App)

### Architecture
- Express SPA mounted at `/portal` on the same Koyeb instance as the bot
- Entry: `portal/server.js` (imports `src/index.js` for shared bot client)
- Auth: Discord OAuth2 → HMAC-signed `portal_session` cookie (`portal/routes/auth.js`)
- Callback: `/portal/auth/callback`
- All API routes: `/api/portal/*` (require `portalAuth` middleware)

### Frontend Files
- `portal/views/portal.html` — single HTML shell
- `portal/public/js/portal-app.js` — 1800+ line SPA
- `portal/public/css/portal.css` — 2500+ line stylesheet

### Portal CSS Design Language
Dark theme: `--surface`, `--card`, `--elevated` backgrounds; `--accent` (#5865f2 Discord blue); `--danger` red; `--warning` amber. Cards: `var(--radius)` (10px), `var(--border)` borders. No emojis.

### Modes
- **Civilian mode** — default for all users
- **LEO mode** — locked to users with LEO Discord role (`isLeo: true`)
- Mode stored in `localStorage.portalMode`

### Key Portal API Routes (`/api/portal/`)
- `GET /me` — current user info
- `GET /characters`, `POST /characters`, `DELETE /characters/:id` — CAD character management
- `GET /vehicles`, `POST /vehicles` — CAD vehicle management
- `GET /officers/overview` — read-only officer status strip (civs)
- `GET /voice/channels` — list guild voice channels
- `POST /voice/move` — self-move to voice channel (requires user already in voice)
- `GET /civjobs` — available jobs
- `POST /civjobs/checkin/:jobId` + `POST /civjobs/checkout` — job shift management
- `POST /emergency` — 911 call submission (civ)
- `GET /priority` — current priority status
- Panic button → upserts `OfficerStatus` with `tenCode: '10-99', panicAnnounced: false`

### Panic Button Flow
Portal sets `OfficerStatus.panicAnnounced = false`. Bot's `voiceListener.js` runs `_startPanicPoller` every 5 seconds (started on bot ready for any guild with dispatch configured). Poller finds unannounced panics and fires TTS + embed in dispatch channel. Optional: portal calls `BOT_INTERNAL_URL/internal/panic` for direct trigger.

---

## Stripe / Payments

### Checkout Flow (`src/website/routes/checkout.js`)
- Monthly subscription: `mode: 'subscription'` — auto-creates Stripe customer, do NOT include `customer_creation`
- Lifetime: `mode: 'payment'` + `customer_creation: 'always'`
- Webhook handlers: `checkout.session.completed` → creates `PremiumKey` in DB
- `customer.subscription.deleted` + `invoice.payment_failed` → marks expired, clears premium cache
- `STRIPE_WEBHOOK_SECRET` required for key creation webhook; lifecycle events work without it

---

## Known Issues & Critical Notes

### MongoDB Buffering Errors on Replit
Replit may not maintain a stable MongoDB Atlas connection. Any timed interval that queries MongoDB should check `mongoose.connection.readyState === 1` first to skip gracefully:
```js
if (mongoose.connection.readyState !== 1) return;
```
Applied to: CivilianJobs expiry interval in `src/index.js`.

### Mongoose Model Guard (all models)
Every model file must use:
```js
export default mongoose.models.ModelName || mongoose.model('ModelName', schema);
```
Without this, ESM dynamic re-imports cause "Cannot overwrite model once compiled" errors in production.

### @discordjs/voice Version Lock
Must be `0.19.2+` for DAVE (Discord Audio Video Encryption). Older versions get close code 4017 rejection. `@snazzah/davey` is a required peer dependency.

### Replit UDP Bypass (DO NOT REMOVE)
In `src/utils/voiceListener.js`: synthetic 74-byte IP discovery response emitted on `net.stateChange` at code 2. Without it, voice connection hangs at `connecting` forever on Replit.

### Dashboard Save Bar (moveme)
Voice Mover channel changes update `pendingChanges.allowedChannelIds` in the `_movemeState` object. The save bar POST sends `allowedChannelIds` to `POST /api/guild/:id/settings/moveme` which whitelists it.

---

## Dashboard Changes (June 2026)

### Voice Mover Dashboard (`site/js/dashboard.js`)
- Added to FEATURES array, SIDEBAR_GROUPS (Community), FEATURE_CATEGORIES, CONFIGURE_CARDS
- `renderMovemeSettings(data)` — toggle + panel channel (from `renderSettingsFields`) + allowed voice channels list + "Send Panel to Discord" button
- `addMovemeChannel()`, `removeMovemeChannel(id)` — DOM-only updates with `pendingChanges.allowedChannelIds`
- `sendMovemePanel(e)` → `POST /api/guild/:id/settings/moveme/panel/send`

### Civilian Jobs Dashboard (`site/js/dashboard.js`)
- Added to SIDEBAR_GROUPS (Economy), CONFIGURE_CARDS (no feature toggle — no enabled field on model)
- `renderCivJobsSettings(data)` — job board channel (from `renderSettingsFields`) + jobs list
- API field names: `j.name`, `j.jobId`, `j.durationHours`, `j.roleName` (NOT title/payPerHour/id)
- Add job: `POST /api/guild/:id/civjobs/job` with `{ name, description, roleId, durationHours }` — role AND duration are required
- Delete job: `DELETE /api/guild/:id/civjobs/job/:jobId`

### Session Persistence + Loading (`site/js/dashboard.js`)
- `sessionStorage` saves last `rpm_guild_id` + `rpm_section`
- `init()` restores directly to last server+section on refresh
- `fullPageLoader(msg)` — animated spinner replaces bare "Loading..." text
- `settingsSkeletonLoader()` — shimmer skeleton replaces bare "Loading..." in settings pane
- `renderServerSelect()` calls `clearSession()` on server switch

### Economy Dashboard
- Store Items CRUD + Role Income CRUD fully in web dashboard
- API: `GET/POST/DELETE /api/guild/:id/economy/store`, `POST/DELETE /api/guild/:id/economy/roleincome/:roleId`
- Both functions exist in `site/js/dashboard.js` and `src/website/public/js/dashboard.js`

---

## External Dependencies
- **discord.js v14** — Discord API client
- **@discordjs/voice 0.19.2** — Voice (DAVE encryption, must be 0.19.2+)
- **@snazzah/davey** — DAVE E2E encryption (peer dep of @discordjs/voice)
- **opusscript** — Pure-JS Opus codec for audio receiving
- **prism-media** — Opus → PCM decoding
- **openai** — Whisper transcription + GPT-4o-mini dispatch responses
- **mongoose** — MongoDB ODM
- **express** — HTTP server + API
- **cookie-parser** — Cookie auth for portal
- **stripe** — Payment processing
- **dotenv** — Environment variables
- **uuid** — Unique ID generation
