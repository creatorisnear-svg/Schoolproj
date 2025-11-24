# EverLink Discord Bot

## Overview
EverLink is a Discord bot designed for multi-server roleplay and gaming communities, particularly those involved in GTA5 RP. Its core purpose is to streamline community management through features like emergency reporting (911), member verification, staff management, a strike system, priority tracking, a roleplay calendar, sticky messages, anti-promoting, reaction roles, and a role request system. The bot offers independent configuration for each server, enhancing administration and member experience in roleplaying environments.

## User Preferences
- All bot responses must use Discord embeds
- EverLink branding on all embeds (footer: "EverLink")
- MongoDB for persistent data storage

## System Architecture
The EverLink Discord bot is built on Node.js (v20) using the Discord.js v14 library, with MongoDB Atlas for persistent data storage.

**UI/UX Decisions:**
- All bot responses leverage Discord embeds for a clean, professional, and branded interface.
- Embeds consistently feature "EverLink" branding in the footer.
- Interactive elements utilize Discord dropdown selectors, modals, and buttons.
- Configuration fallback messages are provided for unconfigured features.

**Technical Implementations & Feature Specifications:**
- **Modular System Design:** Features are independent and per-server configurable.
- **Permission System:** Commands are gated by Discord Administrator permissions or a custom staff database.
- **Logging System:** A central log channel (`/setlogchannel`) is used for event reporting.
- **Roleplay Commands System:** All roleplay commands (911, Twitter, Anon, CAD) are accessed through menu-based database commands (`/civiliandatabase`, `/leodatabase`, `/firedepartmentdatabase`).
    - **Emergency System:** Tracks 911 calls with unique IDs, supports primary response and unit attachment, pings configured roles, and updates interactive messages. Calls auto-delete after 10 minutes.
    - **CAD System:** Provides full GTA5 RP CAD with character and vehicle management for LEO/Fire Department roleplay.
    - **Character Creation:** A redesigned 3-step process for creating character profiles, including basic info, physical description, and status selection.
    - **LEO Character Search:** Enhanced display of character profiles with traffic tickets, active BOLOs, and status alerts (e.g., red embed for BOLO/wanted characters).
- **Verification System:** Customizable RP tags, questions, welcome messages, and automatic role assignment.
- **Strike System:** Multi-level (1-4) with customizable actions (role assignment, kick, timeout, ban).
- **Priority Tracker:** Real-time status updates for priority events with cooldowns.
- **Roleplay Calendar:** Weekly RP events with automatic timezone conversion.
- **Sticky Messages:** Auto-reposts every 1 message with a "__**Stickied Message:**__" prefix.
- **Anti-Promoting System:** Detects and removes non-whitelisted Discord invite links with a staff bypass option.
- **Reaction Role System:** Up to 5 emoji-role pairs per message with a menu-based workflow.
- **Ticket Support System:** Custom ticket types with role access control and automatic channel creation.
- **Role Request System:** Allows members to request roles and staff to approve/deny via DMs. Configurable for specific roles and approvers.
- **Database Integration:** Mongoose schemas ensure per-server data isolation and persistence.

**Core Workflow for Feature Management:**
- A unified `/enablecommands` command provides a step-by-step UX flow for enabling or disabling features.
- Users select "Enable Features" or "Disable Features" and then choose specific features via buttons.

## External Dependencies
- **Discord.js v14:** Primary library for interacting with the Discord API.
- **MongoDB Atlas:** Cloud-hosted NoSQL database for persistent data storage.
- **Mongoose:** Object Data Modeling (ODM) library for MongoDB.
- **Express:** Used for HTTP server functionality (e.g., health checks).
- **Dotenv:** For managing environment variables.
- **UUID:** For generating unique identifiers (e.g., for role request configurations).