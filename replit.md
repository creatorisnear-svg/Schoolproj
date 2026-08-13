# RolePlayManager Discord Bot

## Overview
RolePlayManager is a Discord bot for multi-server GTA5 RP communities. It handles emergency reporting (911), member verification, staff management, strike system, priority tracking, RP calendar, sticky messages, anti-promoting, reaction roles, role requests, economy, civilian jobs, voice mover, AI voice dispatch, and a civilian/LEO web portal. Each server gets its own independent configuration stored in MongoDB.

**Stack:** Node.js (ESM), Discord.js v14, Mongoose/MongoDB Atlas, Express, Stripe, OpenAI  
**Production:** Koyeb (bot + API, port 8000) + Cloudflare Pages (static site, `site/` directory)  
**Dev/editing:** Replit only — push to GitHub to deploy

---

## User Preferences
- All bot responses must use Discord embeds
- Minimalist UI: all embeds use `#2d2d2d` color (except Priority Tracker: red while active, orange while on cooldown), footer `RPM`, no emojis anywhere
- Discord markdown formatting (`### headers`, `-# subtext`, `` `code blocks` ``) preferred
- MongoDB for all persistent data storage
- Staff and Admins have full access to all commands; general members restricted to roleplay/verification commands only
- Dashboard design: dark theme, minimalist, no emojis, `--accent` #5865f2
- Applications feature = **"custom application panels for any purpose"** — never describe as "staff application panels" anywhere (commands, dashboard, landing page, descriptions)
- Keep the current Premium pricing ($5 monthly, $14 every 3 months, $48.99 lifetime) while improving setup, feature discovery, and conversion clarity before reconsidering prices
- Avoid duplicate feature lists, setup paths, or configuration sources; prefer one canonical definition reused everywhere
- Before making a change, record in this file what is being changed. At the end of the session explicitly say "change done" or "added"; if neither is stated, the next AI should treat the work as incomplete and continue it

---

## Active Change Scope
- **Completed:** Clarify the AI handoff response after imported-project setup is complete and no requested blocker remains.

## AI Handoff Protocol — Read Before Responding

This section controls the first response after an AI reads `replit.md`. Follow it exactly:

1. Read this file completely before making assumptions or replying.
2. Scan for unfinished work in this order:
   - `Active Change Scope`: any item marked **In progress**, **Blocked**, **Planned**, or **Incomplete**.
   - The current project task list: any task marked `IN_PROGRESS`, `BLOCKED`, or `TODO`.
   - The latest user request: any explicit requirement not yet implemented or verified.
   - `git status --short`: modified or untracked files that are not explained by the active scope or the latest user request.
   - `changelog-next.json`: changes that are not described, validated, or reflected in the active scope.
   - Documented blockers such as missing secrets, unavailable services, failed workflows, or failed validation.
   - Once imported-project setup is complete, do not treat optional credentials or a proposed follow-up task as an unfinished blocker unless the user explicitly asked to run or connect that service.
3. If the scan finds no unfinished work or blocker, respond with exactly:

   `Ready to serve.`

   Do not add a summary, greeting, explanation, questions, bullets, or code formatting.
4. If the scan finds unfinished work, do not say “Ready to serve.” Report only:
   - `Unfinished:` followed by the specific incomplete item(s).
   - `Blocked:` followed by the exact blocker, if applicable.
   - `Next:` followed by the smallest action needed to continue.
5. Before changing any file, replace the `Active Change Scope` entry with a concise description of the new work. After completing it, mark the entry **Completed** and update `changelog-next.json`.
6. Never treat a cleanly documented pending changelog as unfinished solely because `changelog-next.json` exists; it is the release descriptor until the next release is deployed.
7. At the end of an implementation session, explicitly say `change done` or `added`. If neither phrase is present, the next AI must treat the work as incomplete and continue it.

### Imported Project Completion Rule

After the imported project has been inspected, its setup path has been documented, and no current user request or required setup step remains incomplete, respond exactly:

`Ready to serve.`

Missing optional runtime secrets (for example, Discord or MongoDB credentials) are only blockers when the user asked to run or connect the service. Replit remains development-only unless the user requests a deployment change.

## Agent Checklist — Read This First

Before touching any file, internalize these rules. They prevent the most common mistakes:

### After every set of changes
1. **Update `changelog-next.json`** — bump semver version, update `title` and `changes[]`. Koyeb reads this on deploy and auto-posts to Discord. Never skip.
2. **Edit `site/js/dashboard.js`** — NOT `src/website/public/js/dashboard.js`. The `site/` directory is what Cloudflare Pages serves to all users at roleplaymanager.xyz.
3. **Commit and push to GitHub** — `git add -A && git commit -m "..."` then push. Replit may auto-commit but verify with `git status` first.

### Before adding any new premium feature
- Add `checkFeatureAccess(guildId, featureKey)` at the entry point of every Discord interaction handler (not just the config command)
- Add `checkFeatureAccess` to every API route that creates, modifies, or triggers that feature — not just the settings save route
- If it's default-premium (gated without needing a FeatureFlag DB record), add it to the defaults list in `isFeaturePremiumGated` in `src/utils/premiumCheck.js`
- Add `premium: true` to the item in `SIDEBAR_GROUPS` (line ~277) in `site/js/dashboard.js` for the PRO badge
- Add the feature key to `isFlagPremium` defaults in `site/js/dashboard.js` for the overview page badge

### Before editing large files
- `src/website/routes/api.js` — ~3200 lines. Read only the section you need. Never chain multiple Edit calls on overlapping regions.
- `economyActions.js` — ~1675 lines. Multi-step edits have caused catastrophic duplication before. Read head/tail separately; prefer targeted single edits.
- `site/js/dashboard.js` — ~3100 lines. Same caution — read the relevant function before editing.

---

## Running on Replit

**Replit is for dev/editing only** — production runs on Koyeb (bot + API) and Cloudflare Pages (static site). See Deployment Architecture below.

### To run the bot locally on Replit
1. Add two secrets in the Secrets tab (lock icon):
   - `DISCORD_TOKEN` — your Discord bot token
   - `MONGODB_URI` — your MongoDB Atlas connection string  
   *(All other env vars are pre-set in `.replit` userenv.shared)*
2. Click **Run** (or use the "Start application" workflow) — runs `npm start` → `src/index.js` on port 5000
3. The web portal will be accessible in the preview pane; the bot connects to Discord and MongoDB

### Dependencies
Run `npm install` to install all Node.js dependencies (done on import).

---

## Auto-Changelog (Agent Responsibility)

After every update session, the agent **must** update `changelog-next.json` in the repo root before the user pushes to GitHub. Do not skip this.

**How it works:**
- `changelog-next.json` holds the next release's version, title, and changes list
- On Koyeb startup, `src/index.js` reads this file, checks if that version already exists in MongoDB, and if not → creates the `Changelog` entry and fires a Discord webhook automatically
- The webhook URL is stored as `CHANGELOG_WEBHOOK_URL` env var (set in Replit shared env and must be set on Koyeb too)

**Agent workflow — after every set of changes:**
1. Bump the version in `changelog-next.json` (semver)
2. Update `title` and `changes` array to describe what was done
3. Commit and push — Koyeb deploy will auto-create the changelog entry and notify Discord

**File format:**
```json
{
  "version": "1.2.3",
  "title": "Short description of the release",
  "changes": [
    "Added X",
    "Fixed Y",
    "Improved Z"
  ]
}
```

**Key files:**
- `changelog-next.json` — the pending release descriptor (agent maintains this)
- `src/utils/changelogWebhook.js` — Discord webhook sender utility
- `src/index.js` — startup hook that reads the file and creates the entry (~line 1155)

---

## CRITICAL — Read Before Editing Anything

1. **Two dashboards exist — always edit `site/`, not `src/website/public/`.**

   | File | Served by | Who sees it |
   |------|-----------|-------------|
   | `site/js/dashboard.js` + `site/css/style.css` | Cloudflare Pages | All users at roleplaymanager.xyz — **edit this one** |
   | `src/website/public/js/dashboard.js` + `.../style.css` | Koyeb Express | Legacy/secondary, rarely needed |

   Same rule for the dev panel: `roleplaymanager.xyz/dev` is served from **`site/dev/index.html`** (Cloudflare Pages), NOT `src/website/views/devpanel.html` (Koyeb-only). The dev panel calls the Koyeb API (`API_BASE` in that file) with `Authorization: Bearer <DEV_PASSWORD>`.

2. **Replit is dev-only.** Changes must be pushed to GitHub to reach production — Cloudflare Pages auto-deploys in ~30s, Koyeb takes ~2min. The bot may not connect to MongoDB/Discord properly inside Replit itself. If users say changes aren't showing on the website, tell them to hard-refresh (Ctrl+Shift+R) to bypass CDN cache.

3. **Every Mongoose model must use the guard pattern**, or ESM dynamic re-imports throw "Cannot overwrite model once compiled" in production:
   ```js
   export default mongoose.models.ModelName || mongoose.model('ModelName', schema);
   ```

4. **Never remove the Replit UDP bypass** in `src/utils/voiceListener.js`. Discord voice servers never reply to UDP from Replit (inbound blocked), so `@discordjs/voice`'s `performIPDiscovery()` hangs forever. The bypass intercepts `net.stateChange` at code 2 and emits a synthetic 74-byte fake IP discovery response. Without it, voice connections hang at `connecting` forever on Replit. (Outbound TTS UDP works fine — only inbound is blocked.)

5. **MongoDB may disconnect on Replit.** Any timed interval that queries MongoDB should guard with `if (mongoose.connection.readyState !== 1) return;` to avoid log spam / errors when the connection drops (see the Civilian Jobs expiry interval in `src/index.js`).

6. **`@discordjs/voice` must stay ≥ `0.19.2`** for DAVE (Discord Audio/Video E2E Encryption) support — older versions get rejected with close code 4017. `@snazzah/davey` is a required peer dependency.

7. **Premium gating must be applied at every layer** — config command, interaction handler entry point, AND every API route. See Premium System section below. A feature gated only in `/config` can still be accessed directly via API or by clicking an existing panel.

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
CHANGELOG_WEBHOOK_URL  - Discord webhook for auto-posting changelog on deploy
```

---

## Premium System

### How it works
- `PremiumKey` model — locked to one guild. Plans: `lifetime`, `manual`, `active` (Stripe monthly), `trialing`, `past_due`, `cancelling`, `cancelled`.
- `GuildTrial` model — 3-day free trial, one per server ever, activated by voting on Top.gg.
- `FeatureFlag` model — per-feature override in MongoDB. If no record exists, hardcoded defaults apply.
- Results cached 5 minutes. Bust with `clearPremiumCache(guildId)` / `clearFeatureFlagCache(featureKey)`.

### Default premium features (no FeatureFlag record needed)
These are gated without requiring a FeatureFlag document in the database:

| Feature key | Default gated | Where defined |
|-------------|--------------|---------------|
| `dispatch` | Yes | `isFeaturePremiumGated` in `premiumCheck.js` |
| `priority` | Yes | `isFeaturePremiumGated` in `premiumCheck.js` |
| `appys` | Yes | `isFeaturePremiumGated` in `premiumCheck.js` |
| `blacklist` | Depends on FeatureFlag | FeatureFlag DB only |
| All others | No | FeatureFlag DB only |

> **Critical:** `isFeaturePremiumGated` in `src/utils/premiumCheck.js` has a hardcoded default:
> ```js
> const result = flag ? flag.premium : (featureKey === 'dispatch' || featureKey === 'priority' || featureKey === 'appys');
> ```
> If you add a new always-premium feature, add its key here too.

### Dashboard premium detection
`isFlagPremium(featureKey)` in `site/js/dashboard.js` mirrors the above for the frontend:
```js
function isFlagPremium(featureKey) {
  if (featureKey in featureFlags) return featureFlags[featureKey] === true;
  return featureKey === 'dispatch' || featureKey === 'priority' || featureKey === 'appys';
}
```
The overview feature cards use `isFlagPremium(m.feature)` to render the "Premium" badge.

### Sidebar PRO badges
`SIDEBAR_GROUPS` in `site/js/dashboard.js` has `premium: true` on: `priority`, `dispatch`, `blacklist`, `appys`. The `renderSidebar` function renders a blue PRO pill next to those items. Add `premium: true` to any new premium feature's entry in `SIDEBAR_GROUPS`.

### Free limits vs premium limits
| Resource | Free | Premium |
|----------|------|---------|
| CAD characters | 100 | Unlimited |
| CAD vehicles | 200 | Unlimited |
| CAD firearms | 100 | Unlimited |
| BOLOs | 20 | Unlimited |
| Sticky messages | 5 | Unlimited |
| Ticket types | 5 | Unlimited |
| Role income roles | 2 | Unlimited |
| Leaderboard size | 10 | 25 |

### Premium gate checklist for new features
When adding a new premium feature, gate ALL of these:
- [ ] `/config <module>` subcommand (`src/commands/config.js`)
- [ ] The Discord interaction entry point handler (e.g. `handleXxxOpen` in the handler file)
- [ ] `POST /api/guild/:id/settings/:mod` — add to `PREMIUM_SETTINGS_MODS` array in `api.js`
- [ ] Every sub-route API endpoint (create, update, delete, panel send, reload, etc.)
- [ ] Add feature key to `isFeaturePremiumGated` defaults in `premiumCheck.js` if it should be gated without a DB record
- [ ] Add `premium: true` to `SIDEBAR_GROUPS` entry and `isFlagPremium` defaults in `site/js/dashboard.js`

---

## Bot Architecture

- **Entry point**: `src/index.js` — connects to MongoDB, logs into Discord, starts Express server, loads all handlers, registers slash commands.
- **Handlers** (`src/handlers/`): `economyHandler.js`, `economyActions.js` (~1675 lines — edit carefully), `dispatchHandler.js`, `verifyHandler.js`, `strikeHandler.js`, `ticketHandler.js`, `appyHandler.js`, `setupWizardHandler.js` (handles `setup_config_select` interactions from `/setup`), `blacklistHandler.js`, etc.
- **Models** (`src/models/`): `Announcement`, `AuthorizedUser`, `AutoJoin`, `AutoRole`, `BOLO`, `CADCharacter`, `CADConfig`, `Changelog`, `CivilianJobConfig`, `Config`, `DispatchConfig`, `EconomyBalance`, `EconomyConfig`, `EconomyInventory`, `EconomyStore`, `EmergencyCall`, `FeatureFlag`, `GuildTrial`, `JobAssignment`, `MemberMovementConfig`, `OfficerStatus`, `PendingVerification`, `PremiumKey`, `PreviewVideo`, `Priority`, `PriorityRequest`, `ReactionRole`, `RoleplayCalendar`, `RoleplayCommands`, `RoleRequestConfig`, `RoleRequest`, `Staff`, `StatusHeartbeat`, `Sticky`, `Strike`, `StripeConfig`, `TicketConfig`, `Ticket`, `TrafficTicket`, `Verification`, `VoteTrial`, `Welcome`, `AppyConfig`, `AppyPanel`, `AppySubmission`, `AppyDraft`, `BlacklistConfig`, `Blacklist`
- **Utilities** (`src/utils/`): `premiumCheck.js` (`checkFeatureAccess`, `isPremiumGuild`, `isFeaturePremiumGated`, `getGuildLimits`, `buildPremiumEmbed`, `clearPremiumCache`, `clearFeatureFlagCache`, cached 5 min), `embedBuilder.js` (`successEmbed`/`errorEmbed`), `permissions.js` (`checkStaffPermission`), `voiceListener.js` (AI dispatch voice pipeline + UDP bypass, see Critical section)
- **Slash commands** (`src/commands/`), registered globally:
  - **Setup & Config**: `/setup` (server status dashboard + jump-to-feature wizard), `/config <module>` (unified config — subcommands: `general`, `features`, `verify`, `tickets`, `economy`, `strikes`, `welcome`, `antipromo`, `roles`, `priority`, `calendar`, `moveme`, `roleplay`, `appys`, `dispatch`)
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
- **Feature flags**: `FeatureFlag` model marks premium-gated features. `GET /api/public/features` (public), `PATCH /dev/features/:feature` (dev-password protected). See Premium System section for defaults.
- **Premium**: See Premium System section above.
- **Logging**: `/setlogchannel` sets a guild log channel (`Config` model); most moderation actions post there.
- **AI Voice Dispatch** — premium: Officers speak in patrol voice channels → Whisper transcription → GPT-4o-mini dispatcher reply. Parses 10-codes (10-4, 10-8, 10-11, 10-80, 10-99 panic). Voice CAD queries ("dispatch, run plate/name [X]"). Live status board embed + 911 repeat announcements every 2 min. Configured via `/dispatchsetup`; requires `OPENAI_API_KEY`. Models: `DispatchConfig`, `OfficerStatus`.
- **Economy**: `EconomyConfig` per guild. Cash/bank (`EconomyBalance`), work/crime/rob, gambling (blackjack, roulette, slots, dice, russian roulette, cockfight), role income, chat money, store + inventory (`EconomyStore`, `EconomyInventory`). ~140 built-in GTA V vehicles (`src/data/gtaVehicles.js`), merged at display time (not seeded to DB). Business system: `BusinessAccount`/`BusinessInventory`/`BusinessTransaction` models; commands: `/business`, `/paybusiness`, `/businessleaderboard`, `/businessinfo`, `/businesstransfer`, `/businessadjust`; handlers in `economyActions.js`; dashboard section in `site/js/dashboard.js`.
- **Civilian Jobs**: `CivilianJobConfig` (jobs list + job board channel), `JobAssignment` (active assignments with `expiresAt`). Job board panel via buttons; role auto-removed after `durationHours` via interval in `src/index.js`.
- **Voice Mover**: `MemberMovementConfig` (`enabled`, `panelChannelId`, `allowedChannelIds`). Members click a panel button to self-move between allowed voice channels.
- **Applications (Appys)** — premium: Custom application panels for any purpose (staff, whitelist, events, etc.). Models: `AppyConfig`, `AppyPanel`, `AppySubmission`, `AppyDraft`.
  - Staff define application types via dashboard or `/appyconfig`. Each type has: `name`, `description`, `questions[]`, `acceptRoleId` (optional — assigned on accept), `acceptMessage` (optional — custom message appended to the acceptance DM), `reviewChannelId`, `reviewPingRoleIds[]`.
  - Members pick a type from a select menu panel → bot DMs questions one-by-one (30 min inactivity timeout, blocks re-apply while pending) → submission posted with Accept/Deny buttons → user DM'd (with `acceptMessage` if set) + role assigned on accept.
  - `AppyDraft` — persists in-progress sessions to MongoDB so a bot restart mid-application doesn't lose answers. Restored on startup via `restoreAppyDrafts()`.
  - Routing: `src/handlers/appyHandler.js`. DMs routed via `messageCreate` in `src/index.js`.
  - Premium check at `handleAppyOpen` entry point (members can't start an application if server isn't premium).
- **Verification**: customizable RP tags, questions, welcome message, role assignment via a panel + modal.
- **Strikes**: 4 levels, configurable punishments (role, kick, timeout, ban).
- **Tickets**: custom types (5 free / unlimited premium), button panel → modal → private channel. Types reload from MongoDB per submission to avoid session-expiry bugs.
- **Anti-Promoting**: removes non-whitelisted Discord invite links; per-guild whitelist; staff bypass.
- **Reaction Roles**: up to 5 emoji-role pairs per message.
- **Sticky Messages**: reposts a configured message after every new message, prefixed `__**Stickied Message:**__`.
- **Blacklist**: IP + gamertag protection, `BlacklistConfig`/`Blacklist` models. Commands `/blacklist` and `/removeblacklist` both gate on `checkFeatureAccess(guildId, 'blacklist')`. The `POST /guild/:id/blacklist/panel` API route also requires this check.
- **Priority Tracker** — premium: `Priority` model. Red embed while active, orange on cooldown. Commands: `/activepriority`, `/deactivatepriority`, `/priorityrequest`.

---

## Website & Dashboard (Cloudflare Pages, `site/`)

```
site/
  index.html      - Landing page
  dashboard.html  - Dashboard SPA
  dev/index.html  - Dev panel (see Critical section)
  js/dashboard.js - ALL dashboard logic (~3100 lines)
  css/style.css   - Dashboard + landing styles
  img/logo.png
```

- **Auth flow**: Discord OAuth2 → `/auth/site/callback` (Koyeb) → JWT via redirect to `roleplaymanager.xyz/dashboard/#token=<token>` → `dashboard.js` stores it in `localStorage.dash_token` → all API calls send `Authorization: Bearer <dash_token>`.
- **Session persistence**: `dashboard.js` saves `rpm_guild_id`/`rpm_section` in `localStorage` (survives reloads, tab closes, OAuth re-auth). Functions: `saveSession`, `clearSession`, `getSavedGuildId`, `getSavedSection`. `renderServerSelect()` clears session on server switch.
- **Loading UI**: `fullPageLoader(msg)` (spinner on init/server select), `settingsSkeletonLoader()` (shimmer while settings load).
- **FEATURES array** (line ~277): all toggleable features with `key`, `feature`, `name`, `icon`, `desc`, `mod`, and optionally `premium: true`. Used to build the `SIDEBAR_GROUPS` and the overview feature cards.
- **`isFlagPremium(featureKey)`**: checks `featureFlags` object (fetched from API) first, then falls back to hardcoded defaults: `dispatch`, `priority`, `appys`. This drives the "Premium" badge on overview feature cards.
- **Sidebar groups**: Foundation, Roleplay & Operations, Moderation, Community, Economy, Advanced. PRO badge shown next to: Priority Tracker, AI Voice Dispatch, Blacklist, Applications.
- **Settings pages** all render via `renderSettings(mod)` → `GET /api/guild/:id/settings/:mod`. Modules: `general`, `roleplay`, `verification`, `strikes`, `tickets`, `welcome`, `antipromo`, `rolerequest`, `priority`, `calendar`, `economy`, `moveme`, `civjobs`, `dispatch`, `appys`, `staff`.
- **Key functions**: `api(path, opts)`, `renderSettings(mod)`, module-specific renderers (`renderMovemeSettings`, `renderCivJobsSettings`, `renderEconomySettings`, `renderRoleRequestSettings`, `renderDispatchExtras`, `renderAppySettings`), `showSaveBar(mod)` / `saveSettings(mod)` (pending-changes save bar), `toggleFeature(el)` (handles premium blocking).
- **Appy dashboard functions**: `renderAppySettings(data)`, `saveAppyType(isEdit)`, `loadAppyEditForm(typeId)`, `deleteAppyType(typeId)`, `sendAppyPanel()`, `addAppyQuestion(val, listId)`, `closeAppyEditForm()`, `showAppyAction(which)`.
- **API base URL**: hardcoded in `site/js/dashboard.js` as `API_BASE` = `https://severe-daryl-officialplaystation5-0f1738f5.koyeb.app`.

---

## Koyeb API Server (`src/website/routes/`)

- **Auth** (`auth.js`): `GET /auth/site/callback` (static site OAuth2 → JWT), `GET /dashboard/callback` (legacy Koyeb-served dashboard). Verifies tokens via Discord `/users/@me`.
- **API** (`api.js`, ~3200 lines), all prefixed `/api/`. Auth via `getToken(req)` — `dash_token` cookie or `Authorization: Bearer`.
  - `GET /api/me`, `GET /api/guild/:id`
  - `GET/POST /api/guild/:id/settings/:mod` (see module list above) — POST checks `PREMIUM_SETTINGS_MODS = ['dispatch', 'appys', 'priority']`
  - `POST /api/guild/:id/feature/:feature` — checks `checkFeatureAccess` before enabling
  - `GET /api/public/features` — public, no auth
  - Appys sub-routes (all require `checkFeatureAccess(guildId, 'appys')`):
    - `POST /guild/:id/appys/type` — create application type
    - `PUT /guild/:id/appys/type/:typeId` — edit application type
    - `DELETE /guild/:id/appys/type/:typeId` — delete application type
    - `POST /guild/:id/appys/panel/send` — send panel to Discord channel
  - `POST /guild/:id/dispatch/reload` — requires `checkFeatureAccess(guildId, 'dispatch')`
  - `POST /guild/:id/blacklist/panel` — requires `checkFeatureAccess(guildId, 'blacklist')`
  - Other module CRUD: tickets types/panel, verification panel, moveme panel, calendar events/post, antipromo links, rolerequest roles, economy store/roleincome/business, civjobs job, staff add
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

## Wording & Naming Conventions

These are enforced across all files — bot responses, dashboard, landing page, command descriptions:

| Wrong | Correct |
|-------|---------|
| "staff application panels" | "custom application panels for any purpose" |
| "Staff Application" (as example ticket type) | "Ban Appeal" or similar |
| Any emoji in embeds or dashboard | No emojis anywhere |
| "staff application panels with DM Q&A flow" | "custom application panels with DM Q&A flow" |

When adding new feature descriptions, always keep them general and inclusive. "Staff" implies only one use case.

---

## Known Past Bugs — Do Not Reintroduce

These were discovered and fixed. Understanding why they happened prevents them coming back:

1. **`appys` missing from `isFeaturePremiumGated` defaults** — The function only defaulted `dispatch` and `priority`. `appys` was missing, meaning `checkFeatureAccess(guildId, 'appys')` returned `allowed: true` for every guild. Fix: added `appys` to the condition. Same bug existed in `isFlagPremium` on the frontend (only `dispatch` was hardcoded).

2. **`handleAppyOpen` had no premium check** — The config command was gated but not the actual interaction entry point. A member could click an existing panel button and submit an application even after the server's premium lapsed. Fix: add `checkFeatureAccess` at the top of every handler entry point, not just config.

3. **API sub-routes missing premium checks** — `POST/PUT/DELETE /guild/:id/appys/type` and `POST /guild/:id/appys/panel/send` checked admin access but not premium. An admin could bypass the dashboard UI and manage appy types via direct API calls. Fix: add `checkFeatureAccess` before the guild lookup in every sub-route.

4. **`dispatch/reload` and `blacklist/panel` API routes missing premium checks** — Same pattern as above. Config save was gated but the action endpoints were not.

5. **Editing `src/website/public/js/dashboard.js` instead of `site/js/dashboard.js`** — These are two separate files. The Koyeb copy is legacy. Only `site/` is visible to end users at roleplaymanager.xyz.

6. **Mongoose "Cannot overwrite model once compiled"** — Missing `mongoose.models.X ||` guard on model files causes crashes on ESM hot-reloads or dynamic imports in production.

7. **`economyActions.js` chained edits causing duplication** — File is ~1675 lines. Multiple overlapping Edit tool calls in one session caused entire sections to be duplicated. Always read the file head/tail first, make one surgical edit at a time.

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
