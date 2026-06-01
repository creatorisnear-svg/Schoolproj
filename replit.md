# RolePlayManager Discord Bot

## Overview
RolePlayManager is a Discord bot designed for multi-server roleplay and gaming communities, particularly those involved in GTA5 RP. Its core purpose is to streamline community management through features like emergency reporting (911), member verification, staff management, a strike system, priority tracking, a roleplay calendar, sticky messages, anti-promoting, reaction roles, and a role request system. The bot offers independent configuration for each server, enhancing administration and member experience in roleplaying environments. The project also aims to provide a comprehensive economy system with role-based income, work/crime commands, gambling, a store/inventory, and granular permission controls.

## User Preferences
- All bot responses must use Discord embeds
- Minimalist UI: all embeds use `#2d2d2d` color, footer `RPM`, no emojis
- Discord markdown formatting (### headers, `-#` subtext, `code blocks`) preferred
- MongoDB for persistent data storage
- Staff and Admins have full access to all commands
- General members restricted to roleplay/verification commands only

## System Architecture
The RolePlayManager Discord bot is built on Node.js (v20) using the Discord.js v14 library, with MongoDB Atlas for persistent data storage.

**UI/UX Decisions:**
- Minimalist design: `RPM` footer, zero emojis, clean text.
- Contextual color coding: success `#43b581` (green), error `#f04747` (red), warning `#faa61a` (amber), neutral/info `#2d2d2d` (dark). Priority Tracker uses red when active.
- Help command uses Discord `###` headers and inline code for commands.
- Embed descriptions use clean **bold** key-value pairs instead of field-heavy layouts.
- Interactive elements utilize Discord dropdown selectors, modals, and buttons.
- Configuration fallback messages are provided for unconfigured features.

**Technical Implementations & Feature Specifications:**
- **Logging & Stability**: Custom startup sequence mimicking Koyeb environment logs. All interaction handlers are wrapped in try-catch blocks with 10062 (Unknown Interaction) error handling to prevent bot crashes. Uses `clientReady` event for compatibility with latest Discord.js practices.
- **Developer Control Panel:** Advanced `/dev` menu with role/channel selectors, auto-join management, and OAuth2 control (including `connections` and `voice` scopes).
- **Permission System:** Commands are gated by Discord Administrator permissions (Admins/Staff) or a custom staff database. Admins inherit all staff permissions.
- **Logging System:** A central log channel (`/setlogchannel`) is used for event reporting.
- **Roleplay Commands System:** All roleplay commands (911, Twitter, Anon, CAD) are accessed through menu-based database commands (`/civiliandatabase`, `/leodatabase`, `/firedepartmentdatabase`). This includes an Emergency System, a full GTA5 RP CAD with character and vehicle management, and a redesigned 3-step character creation process.
- **Verification System:** Customizable RP tags, questions, welcome messages, and automatic role assignment.
- **Strike System:** Multi-level (1-4) with customizable actions (role assignment, kick, timeout, ban).
- **Priority Tracker:** Real-time status updates for priority events with cooldowns.
- **Roleplay Calendar:** Weekly RP events with automatic timezone conversion.
- **Sticky Messages:** Auto-reposts every 1 message with a "__**Stickied Message:**__" prefix.
- **Anti-Promoting System:** Detects and removes non-whitelisted Discord invite links with a staff bypass option.
- **Reaction Role System:** Up to 5 emoji-role pairs per message, configurable for any message.
- **Ticket Support System:** Custom ticket types with role access control and automatic channel creation. Ticket opening modals use the persistent ticket type ID and reload configuration from MongoDB on submit, avoiding in-memory session expiry during ticket creation.
- **Role Request System:** Allows members to request roles and staff to approve/deny via DMs.
- **Welcome System:** Sends configured channel and DM embeds when new members join via the `guildMemberAdd` listener in `src/index.js`.
- **Status Heartbeat System:** Background system for monitoring bot status, sending periodic messages to a support server.
- **Database Integration:** Mongoose schemas ensure per-server data isolation and persistence.
- **AI Voice Dispatch System:** Officers speak in monitored voice channels; the bot captures their audio via `@discordjs/voice`, transcribes it using OpenAI Whisper, parses 10-codes (10-4, 10-8, 10-11, 10-80, etc.), generates a realistic GTA5 RP dispatcher response via GPT-4o-mini, posts a branded embed to the dispatch channel, asks officers to confirm before moving them/civilians into a traffic stop voice channel, and maintains a live status board. Configured per-guild via `/dispatchsetup` (admin only). Requires `OPENAI_API_KEY` environment variable. Models: `DispatchConfig`, `OfficerStatus`. Utils: `src/utils/voiceListener.js`. Handler: `src/handlers/dispatchHandler.js`.
  - **CAD Integration:** Officers can say "dispatch, run plate [plate]" or "dispatch, run name [name]" over voice to query the CAD database. The bot looks up the character/vehicle via `CADCharacter` and `BOLO` models, posts a detailed embed to the dispatch channel (owner, vehicle, wanted status, license, active BOLOs), and speaks the results back via TTS.
  - **Status Board with Active Calls:** The officer status board (`rebuildStatusBoard`) now includes a second embed showing all active 911 calls with responding/attached officers. Officers on the board show which call they're attached to. The board updates when officers respond/attach/dismiss calls or when new 911 calls are created.
  - **911 Call Repeat Announcements:** A 60-second interval checks for active 911 calls older than 2 minutes with no responding or attached officers. Unresponded calls get a text reminder in the dispatch channel and a TTS announcement over the voice channel. Reminders repeat every 2 minutes until someone responds. Cleanup removes tracking for resolved calls.
  - **Replit UDP Bypass (critical):** Discord's voice servers never reply to UDP from Replit's network (inbound UDP is blocked). The `@discordjs/voice` library calls `performIPDiscovery()` before transitioning to networking state code:2 and hangs forever waiting for the response. We intercept the `net.stateChange` event at code:2 and emit a synthetic 74-byte fake IP discovery response directly on the dgram socket, unblocking the Promise. This is implemented in the `stateChange` handler in `voiceListener.js`. **Do not remove this bypass** — without it the voice connection hangs at `connecting` and never reaches `ready`. TTS playback (outbound UDP) works fine because only inbound UDP is blocked.

**Feature Flag System:**
- Developer panel has a "Premium Features" tab where any feature can be marked as Premium or Free.
- Feature flags stored in MongoDB `FeatureFlag` model (`src/models/FeatureFlag.js`).
- `src/utils/premiumCheck.js` exports `checkFeatureAccess(guildId, featureKey)` — returns `{ allowed }` based on whether the feature is premium-gated AND whether the guild has an active premium key. Results cached for 5 minutes; cache cleared on dev panel flag update via `clearFeatureFlagCache()`.
- All 10 setup commands (`dispatchsetup`, `roleplaycommandsetup`, `prioritytrackersetup`, `strikesystemsetup`, `roleplaycalendersetup`, `ticketsupportsetup`, `antipromotingsetup`, `verifysystemsetup`, `welcomesystemsetup`, `rolerequestadd`) call `checkFeatureAccess()` right after the permission check.
- Dashboard feature toggle (`POST /api/guild/:id/feature/:feature`) blocks enabling a premium-gated feature if the guild has no premium key, returning HTTP 403 with `{ error: 'premium_required' }`.
- Frontend (`site/js/dashboard.js` `toggleFeature`) intercepts 403 premium_required and shows a toast directing the user to activate a key, then reverts the toggle.
- Dev API: `GET /dev/features` (list all) and `PATCH /dev/features/:feature` (toggle premium status). Protected by dev password.
- Public API: `GET /api/public/features` — returns a map of `{ featureKey: isPremium }` without auth.
- Landing page (`site/index.html`) fetches feature flags on load and shows/hides Premium badges on feature cards dynamically via `data-feature` attributes.
- Dashboard (`site/js/dashboard.js`) fetches feature flags at startup and applies them to module cards.
- Default: `dispatch` is premium; all others default to free unless set in DB.

**Website & Dashboard:**
- Landing page at `/` with live server/user stats, feature showcase, and invite button.
- Admin dashboard at `/dashboard` with Discord OAuth2 login (`identify guilds` scope).
- Dashboard shows server selector (admin-only servers where bot is present), module status overview, and per-module configuration/stats.
- **Full bot setup through website:** Overview page has feature toggle cards for all 10 modules (Roleplay Commands, Priority Tracker, Strike System, RP Calendar, Ticket Support, Anti-Promoting, Role Request, Verification, Welcome System, AI Voice Dispatch). Each module has a dedicated settings page with all configurable fields.
- **Feature toggle API:** `POST /api/guild/:id/feature/:feature` enables/disables any module. Validates guild exists in bot cache.
- **Settings API:** `GET/POST /api/guild/:id/settings/:mod` for all modules: general, roleplay, verification, strikes, tickets, dispatch, priority, antipromo, welcome, calendar. POST endpoints whitelist allowed fields per module.
- Dashboard auth uses `dash_token` cookie (7-day expiry) on Koyeb, or Bearer token via localStorage on the static site.
- Dashboard OAuth redirect (Koyeb): `https://{DOMAIN}/dashboard/callback`.
- Dashboard OAuth redirect (static site): `https://{DOMAIN}/auth/site/callback` → redirects to `roleplaymanager.xyz/dashboard/#token=<token>`.
- Files: `src/website/views/` (HTML), `src/website/public/css/` (styles), `src/website/public/js/` (client JS), `src/website/routes/` (API + auth routers).
- Static site for Cloudflare Pages: `site/` directory (landing page + dashboard, calls Koyeb API cross-origin).
- API supports both cookie-based and Bearer token auth (`getToken()` helper in `api.js`).
- CORS enabled for `SITE_ORIGIN` env var (default: `https://roleplaymanager.xyz`).
- On Koyeb, `PORT` env var is `8000`; locally defaults to `5000` for Replit webview.

**Premium System:** Premium keys lock to one guild. Servers without premium have limits: 100 characters, 200 vehicles, 100 firearms, 20 active BOLOs. AI Voice Dispatch requires premium. Use `/activatepremium` with a valid key. Keys stored in `PremiumKey` model; checks cached for 5 minutes via `src/utils/premiumCheck.js`.

**Economy System:** A comprehensive economy system — fully implemented. Staff commands: `/economysetup`. All member economy commands are now standalone slash commands. Models: `EconomyConfig`, `EconomyBalance`, `EconomyStore`, `EconomyInventory`. Handler: `src/handlers/economyActions.js`. Data: `src/data/gtaVehicles.js`.
    - **Staff Commands:** `/economysetup` (dropdown menu with: currency, addmoney, removemoney, resetmoney, setlogchannel, work, crime, rob, gambling, roleincome, removeroleincome, chatmoney, storeadd, storeremove, storeedit, storelist, view, enable/disable).
    - **Member Commands (all standalone):** `/balance`, `/leaderboard`, `/deposit <amount>`, `/withdraw <amount>`, `/give <user> <amount>`, `/work`, `/crime`, `/rob <user>`, `/income`, `/shop [search]`, `/inventory`, `/buy <item> [quantity]`, `/sell <item> [quantity]`, `/use <item>`, `/giveitems <user> <item> [quantity]`, `/gamble <blackjack|roulette|slots|dice|russianroulette|cockfight> <bet> [choice]`.
    - **GTA V Built-in Shop:** `src/data/gtaVehicles.js` contains ~140 GTA V vehicles (Super, Sports, Muscle, SUV, Sedan, Truck, Motorcycle, Helicopter, Plane, Boat categories) pre-installed in every server's shop. Built-in items are merged with guild-custom items at display time — no DB seeding needed. Buy/sell works for built-in items using name-based lookup.
    - **Search:** `/shop search:keyword` filters by item name or category. No modal — plain text option.
    - **Key Mechanics:** Balance system (cash, bank), work/crime with success/fail, betting from cash, periodic role income, chat-based money earning, store/inventory (buy, sell 50%, use, give).

## Portal (Civ/LEO Web App)
- Separate Express SPA at `portal/server.js`, runs on same port as bot (`PORT` env var, defaults 5000) but mounted at `/portal`.
- Auth: Discord OAuth2 → HMAC-signed `portal_session` cookie. `portal/routes/auth.js`. Callback at `/portal/auth/callback`.
- API: `portal/routes/api.js` — all routes under `/api/portal/`, all require `portalAuth` middleware.
- Required env vars: `PORTAL_GUILD_ID`, `PORTAL_DOMAIN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_TOKEN`, `MONGODB_URI`.
- Frontend SPA: `portal/views/portal.html` (single HTML), `portal/public/js/portal-app.js` (1800+ lines), `portal/public/css/portal.css` (2500+ lines).
- Mode switching: Civilian vs LEO (stored in `localStorage.portalMode`). LEO mode locked to users with `isLeo: true` from Discord roles.
- **Panic button flow (10-99):** Portal upserts `OfficerStatus` with `tenCode:'10-99', panicAnnounced:false`. Bot's `voiceListener.js` runs a `_startPanicPoller` every 5s (started by `setupDispatchForGuild()` on bot startup when dispatch is configured). Poller finds `panicAnnounced:false` records and fires TTS announcement in voice channel. Portal also calls `BOT_INTERNAL_URL/internal/panic` if env var is set (optional direct trigger). TTS announcement requires the bot to be configured for AI dispatch (`/dispatchsetup`) in the guild.
- **Voice mover:** `GET /api/portal/voice/channels` lists guild voice channels; `POST /api/portal/voice/move` moves the authenticated user to a channel (requires user to already be in voice; requires bot `Move Members` permission).
- **Officer overview (civ):** `GET /api/portal/officers/overview` returns read-only active officer count + status list for civs. Excludes 10-7/10-10. Filters to last 6 hours.
- **Civ Home (Overview tab):** Priority/cooldown widget with live countdown, officers on duty strip (read-only), voice channel mover, stats grid, quick access buttons.

## Conversation Context (for future AI sessions)
- User runs bot on Koyeb instance 1, portal on Koyeb instance 2, shared MongoDB Atlas.
- Both services share the same codebase — `npm start` runs both via `portal/server.js` importing into `src/index.js`.
- Completed: Replit migration, civ home redesign with priority widget + countdown, voice mover, officers strip, panic poller confirmation.
- Portal CSS design language: dark theme, `--surface`, `--card`, `--elevated` backgrounds; `--accent` (#5865f2 Discord blue); `--danger` red; `--warning` amber. Cards have `var(--radius)` (10px) corners, `var(--border)` borders.
- No emojis in UI (user preference). Minimalist Discord embed color `#2d2d2d`, footer `RPM`.
- Replit UDP bypass in voiceListener.js is CRITICAL — do not remove. Discord voice UDP inbound is blocked on Replit; the bypass emits a fake 74-byte IP discovery response to unblock `performIPDiscovery()`.
- Static site (`site/` folder) is deployed on Cloudflare Pages linked to GitHub repo. Build output directory = `site`, no build command. Custom domain `roleplaymanager.xyz` points to Pages via CNAME. Auto-deploys on every GitHub push.
- Bot (Koyeb) and site (Cloudflare Pages) share the same GitHub repo — one push deploys both.

**Stripe Fixes (June 2026):**
- `customer_creation: 'always'` was incorrectly included in shared checkout params for both monthly and lifetime plans. Stripe only allows it in `payment` mode. Fixed: moved it to the `lifetime` branch only (`mode: 'payment'`). Monthly subscriptions (`mode: 'subscription'`) auto-create customers and must not include this param.
- Added `invoice.payment_failed` webhook handler — marks subscription as `past_due` and clears premium cache immediately when a payment attempt fails.
- Added `clearPremiumCache()` calls to `customer.subscription.deleted` and `customer.subscription.updated` webhook handlers so status changes are reflected instantly (no waiting for 5-min cache to expire).
- Webhook file: `src/website/routes/checkout.js`. Premium cache util: `src/utils/premiumCheck.js`.
- `STRIPE_WEBHOOK_SECRET` must be set on Koyeb for key creation via webhook; lifecycle events (cancel/update/payment_failed) work even without it.

**Economy Dashboard (June 2026):**
- Economy settings page in the dashboard now includes full **Store Management** and **Role Income** CRUD — no longer redirects to Discord commands.
- New API endpoints in `src/website/routes/api.js`:
  - `GET /api/guild/:id/economy/store` — list custom store items
  - `POST /api/guild/:id/economy/store` — add item (name, price, description, usable, roleId)
  - `DELETE /api/guild/:id/economy/store/:itemId` — remove item
  - `POST /api/guild/:id/economy/roleincome` — add/update role income entry (roleId, amount, cooldown hours); enforces 2-entry free limit
  - `DELETE /api/guild/:id/economy/roleincome/:roleId` — remove role income entry
- Economy GET settings response now includes `storeItems`, `roleIncomeList` (always, even if empty), and `roles` (for role selectors).
- Dashboard JS (`src/website/public/js/dashboard.js`): `renderEconomySettings` now renders Role Income section with add/remove UI and Store Items section with add/remove UI. New functions: `addRoleIncome`, `deleteRoleIncome`, `addStoreItem`, `deleteStoreItem`.

## External Dependencies
- **Discord.js v14:** Primary library for interacting with the Discord API.
- **MongoDB Atlas:** Cloud-hosted NoSQL database for persistent data storage.
- **Mongoose:** Object Data Modeling (ODM) library for MongoDB.
- **Express:** Used for HTTP server, website landing page, and admin dashboard.
- **cookie-parser:** Cookie management for dashboard authentication.
- **Dotenv:** For managing environment variables.
- **UUID:** For generating unique identifiers.
- **@discordjs/voice 0.19.2:** Voice channel connection and audio pipeline for AI dispatch. **Critical:** Must be 0.19.2+ for DAVE (Discord Audio Video Encryption) protocol support; older versions get rejected with close code 4017.
- **@snazzah/davey:** DAVE E2E encryption library (auto-installed as peer dependency of @discordjs/voice 0.19.2).
- **opusscript:** Pure-JS Opus audio codec (peer dependency for @discordjs/voice audio receiving).
- **prism-media:** Audio stream processing; decodes Opus packets to raw PCM for WAV conversion.
- **OpenAI SDK:** Whisper API (audio transcription) and GPT-4o-mini (dispatcher AI responses).