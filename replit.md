# SARP Core Discord Bot

## Overview
SARP Core is a Discord bot designed for multi-server roleplay and gaming communities, particularly those involved in GTA5 RP. Its core purpose is to streamline community management through features like emergency reporting (911), member verification, staff management, a strike system, priority tracking, a roleplay calendar, sticky messages, anti-promoting, reaction roles, and a role request system. The bot offers independent configuration for each server, enhancing administration and member experience in roleplaying environments. The project also aims to provide a comprehensive economy system with role-based income, work/crime commands, gambling, a store/inventory, and granular permission controls.

## User Preferences
- All bot responses must use Discord embeds
- SARP Core branding on all embeds (footer: "SARP Core")
- MongoDB for persistent data storage
- Staff and Admins have full access to all commands
- General members restricted to roleplay/verification commands only

## System Architecture
The SARP Core Discord bot is built on Node.js (v20) using the Discord.js v14 library, with MongoDB Atlas for persistent data storage.

**UI/UX Decisions:**
- All bot responses leverage Discord embeds for a clean, professional, and branded interface.
- Embeds consistently feature "SARP Core" branding in the footer.
- Interactive elements utilize Discord dropdown selectors, modals, and buttons.
- Configuration fallback messages are provided for unconfigured features.

**Technical Implementations & Feature Specifications:**
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