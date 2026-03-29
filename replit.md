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
- Minimalist design: all embeds use uniform `#2d2d2d` dark color, `RPM` footer, zero emojis.
- Help command uses Discord `###` headers and inline code for commands.
- Embed descriptions use clean **bold** key-value pairs instead of field-heavy layouts.
- Interactive elements utilize Discord dropdown selectors, modals, and buttons.
- Configuration fallback messages are provided for unconfigured features.
- Only exception: Priority Tracker uses red (`0xFF0000`) when active for visual urgency.

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
- **Ticket Support System:** Custom ticket types with role access control and automatic channel creation.
- **Role Request System:** Allows members to request roles and staff to approve/deny via DMs.
- **Status Heartbeat System:** Background system for monitoring bot status, sending periodic messages to a support server.
- **Database Integration:** Mongoose schemas ensure per-server data isolation and persistence.
- **AI Voice Dispatch System:** Officers speak in monitored voice channels; the bot captures their audio via `@discordjs/voice`, transcribes it using OpenAI Whisper, parses 10-codes (10-4, 10-8, 10-11, 10-80, etc.), generates a realistic GTA5 RP dispatcher response via GPT-4o-mini, posts a branded embed to the dispatch channel, automatically moves officers to a traffic stop voice channel on 10-11, and maintains a live status board. Configured per-guild via `/dispatchsetup` (admin only). Requires `OPENAI_API_KEY` environment variable. Models: `DispatchConfig`, `OfficerStatus`. Utils: `src/utils/voiceListener.js`. Handler: `src/handlers/dispatchHandler.js`.
  - **CAD Integration:** Officers can say "dispatch, run plate [plate]" or "dispatch, run name [name]" over voice to query the CAD database. The bot looks up the character/vehicle via `CADCharacter` and `BOLO` models, posts a detailed embed to the dispatch channel (owner, vehicle, wanted status, license, active BOLOs), and speaks the results back via TTS.
  - **Status Board with Active Calls:** The officer status board (`rebuildStatusBoard`) now includes a second embed showing all active 911 calls with responding/attached officers. Officers on the board show which call they're attached to. The board updates when officers respond/attach/dismiss calls or when new 911 calls are created.
  - **911 Call Repeat Announcements:** A 60-second interval checks for active 911 calls older than 2 minutes with no responding or attached officers. Unresponded calls get a text reminder in the dispatch channel and a TTS announcement over the voice channel. Reminders repeat every 2 minutes until someone responds. Cleanup removes tracking for resolved calls.
  - **Replit UDP Bypass (critical):** Discord's voice servers never reply to UDP from Replit's network (inbound UDP is blocked). The `@discordjs/voice` library calls `performIPDiscovery()` before transitioning to networking state code:2 and hangs forever waiting for the response. We intercept the `net.stateChange` event at code:2 and emit a synthetic 74-byte fake IP discovery response directly on the dgram socket, unblocking the Promise. This is implemented in the `stateChange` handler in `voiceListener.js`. **Do not remove this bypass** — without it the voice connection hangs at `connecting` and never reaches `ready`. TTS playback (outbound UDP) works fine because only inbound UDP is blocked.

**Premium System:** Premium keys lock to one guild. Servers without premium have limits: 100 characters, 200 vehicles, 100 firearms, 20 active BOLOs. AI Voice Dispatch requires premium. Use `/activatepremium` with a valid key. Keys stored in `PremiumKey` model; checks cached for 5 minutes via `src/utils/premiumCheck.js`.

**Economy System:** A comprehensive economy with staff (`/economysetup`, `/storesetup`) and member (`/economy`) commands.
    - **Staff Commands:** Manage currency (symbol, start/max balance), money (add/remove/reset, log channel, leaderboard), work/crime settings (cooldowns, payouts, fine rates, custom replies), role income (amounts, cooldowns, fines), chat money (amounts, channels, cooldowns), gambling settings (bet limits, game cooldowns, symbols), and feature permissions.
    - **Member Commands:** Check balance, view leaderboard, deposit/withdraw, give money, engage in work/crime/rob, collect role income, play gambling games (Blackjack, Roulette, Cock-Fight, Russian Roulette, Roll, Slot Machine), and interact with a store/inventory system (view, buy, sell, use, give items).
    - **Key Mechanics:** Features a robust balance system (cash, bank), work/crime with success/fail mechanics, betting from cash, claim-based periodic role income with optional fines, chat-based money earning, and a store/inventory for items.

## External Dependencies
- **Discord.js v14:** Primary library for interacting with the Discord API.
- **MongoDB Atlas:** Cloud-hosted NoSQL database for persistent data storage.
- **Mongoose:** Object Data Modeling (ODM) library for MongoDB.
- **Express:** Used for HTTP server functionality (e.g., health checks).
- **Dotenv:** For managing environment variables.
- **UUID:** For generating unique identifiers.
- **@discordjs/voice 0.19.2:** Voice channel connection and audio pipeline for AI dispatch. **Critical:** Must be 0.19.2+ for DAVE (Discord Audio Video Encryption) protocol support; older versions get rejected with close code 4017.
- **@snazzah/davey:** DAVE E2E encryption library (auto-installed as peer dependency of @discordjs/voice 0.19.2).
- **opusscript:** Pure-JS Opus audio codec (peer dependency for @discordjs/voice audio receiving).
- **prism-media:** Audio stream processing; decodes Opus packets to raw PCM for WAV conversion.
- **OpenAI SDK:** Whisper API (audio transcription) and GPT-4o-mini (dispatcher AI responses).