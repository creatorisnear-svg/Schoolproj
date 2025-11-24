# EverLink Discord Bot

## Overview
EverLink is a Discord bot designed for multi-server roleplay and gaming communities, particularly those involved in GTA5 RP (LEO/EMS). Its core purpose is to streamline community management through features like emergency reporting (911), member verification with RP tags, staff management, welcome systems, a strike system, priority tracking, roleplay calendar with timezone conversion, sticky messages, anti-promoting, and reaction roles. The bot offers independent configuration for each server, including staff teams, verification settings, and RP tags. All bot interactions are presented using branded Discord embeds, aiming to enhance server administration and member experience in roleplaying environments.

## User Preferences
- All bot responses must use Discord embeds
- EverLink branding on all embeds (footer: "EverLink")
- MongoDB for persistent data storage

## System Architecture
The EverLink Discord bot is built on Node.js (v20) using the Discord.js v14 library, with MongoDB Atlas for persistent data storage.

**UI/UX Decisions:**
- All bot responses leverage Discord embeds for a clean, professional, and branded user interface.
- Embeds consistently feature "EverLink" branding in the footer.
- Interactive elements like dropdowns and modals are used for configuration and reporting (e.g., verification setup, 911 reports).

**Technical Implementations & Feature Specifications:**
- **Modular System Design:** Features like Staff Management, Verification, Welcome, 911 Reporting, Logging, Strike System, Priority Tracker, Roleplay Calendar, Sticky Messages, Anti-Promoting, and Reaction Roles are implemented as independent, per-server configurable modules.
- **Permission System:** Commands are gated by Discord Administrator permissions or a custom staff database, ensuring secure access.
- **Logging System:** A central log channel (`/setlogchannel`) is mandatory and used by all other systems for event reporting (e.g., verification answers, anti-promoting incidents, strike actions).
- **Verification System:** Supports customizable RP tags, questions, welcome messages, and automatic role assignment.
- **Strike System:** Features a multi-level strike configuration (1-4) with customizable actions (role assignment, kick, timeout, ban) and durations per level.
- **Priority Tracker:** Provides real-time status updates for "priority" events with cooldowns and custom messages.
- **Roleplay Calendar:** Manages and displays weekly RP events with automatic timezone conversion using 12-hour AM/PM format. Displays times as Discord timestamps that auto-convert to each user's local timezone.
- **Sticky Messages:** Staff/admins can use `/sticky` to create messages that auto-repost every 1 message to keep important information visible. Messages are prefixed with "__**Stickied Message:**__" header.
- **Anti-Promoting System:** Automatically detects and removes non-whitelisted Discord invite links, with an optional staff bypass.
- **Reaction Role System:** Staff/admins can use `/reactionrolemessage` to create messages with emoji reactions that automatically assign roles. Up to 5 emoji-role pairs per message. Menu-based workflow: "Send a New Message" creates a reaction role message, "Add Emoji to Existing Message" adds emoji-role pairs via modals. Requires `GatewayIntentBits.GuildMessageReactions` intent to receive reaction events.
- **Database Integration:** Mongoose schemas define the data models for each system (Staff, Verification, Welcome, Config, StrikeUser, StrikeConfig, Priority, RoleplayCalendar, Sticky, ReactionRole), ensuring per-server data isolation and persistence.

**Project Structure:**
The codebase is organized into `src/` containing:
- `index.js`: Main bot entry point.
- `config/`: Database connection.
- `models/`: Mongoose schemas for all data.
- `commands/`: Individual command files grouped by feature.
- `handlers/`: Logic for modal submissions, select menus, and specific system functionalities (e.g., `modalHandler.js`, `selectMenuHandler.js`, `priorityTrackerHandler.js`, `roleplayCalendarHandler.js`, `antiPromotingHandler.js`).
- `utils/`: Helper functions for embeds, permissions, and invite detection.

## External Dependencies
- **Discord.js v14:** Primary library for interacting with the Discord API.
- **MongoDB Atlas:** Cloud-hosted NoSQL database for persistent storage of all server configurations and user data.
- **Mongoose:** Object Data Modeling (ODM) library for MongoDB and Node.js.