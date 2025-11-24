# EverLink Discord Bot

## Overview
EverLink is a Discord bot designed for multi-server roleplay and gaming communities, particularly those involved in GTA5 RP (LEO/EMS). Its core purpose is to streamline community management through features like emergency reporting (911), member verification with RP tags, staff management, welcome systems, a strike system, priority tracking, roleplay calendar with timezone conversion, sticky messages, anti-promoting, and reaction roles. The bot offers independent configuration for each server, including staff teams, verification settings, and RP tags. All bot interactions are presented using branded Discord embeds, aiming to enhance server administration and member experience in roleplaying environments.

## User Preferences
- All bot responses must use Discord embeds
- EverLink branding on all embeds (footer: "EverLink")
- MongoDB for persistent data storage

## System Architecture
The EverLink Discord bot is built on Node.js (v20) using the Discord.js v14 library, with MongoDB Atlas for persistent data storage.

**Roleplay Commands System (911, Twitter, Anon, CAD):**
Members access roleplay commands directly as slash commands.

**Setup Process:**
1. Staff runs `/roleplaycommandsenable true` or `/roleplaycommandsenable false` to enable/disable the entire system
2. Staff runs `/roleplaycommandsetup` to configure which commands are available through dropdown menu with options:
   - **911 - Emergency Reporting** → Select channel for emergency dispatch
   - **Twitter - Public Messages** → Select channel for public OOC posts  
   - **Anon - Anonymous Messages** → Select channel for anonymous/black market messages
   - **CAD - Computer Aided Dispatch** → Enable CAD system
   - **✅ Done - Close Setup** → Finish configuration

**CAD System Configuration:**
- Configure LEO roles, Fire Department roles, and staff roles through `/cadsystem`
- Enable/disable within roleplay commands setup menu

**Member Access:**
- `/911` - Report an emergency (if configured)
- `/twitter` - Post a public OOC message (if configured)
- `/anon` - Post an anonymous/black market message (if configured)
- `/cad` - View CAD dispatch information (if enabled)

All commands are only available if staff has enabled them through setup.

**CAD System (Computer Aided Dispatch):**
GTA5 RP CAD system with character and vehicle management for LEO/Fire Department roleplay.

**Member Features (`/cadcharacter`):**
- Create characters with detailed information (name, age, gender, hair color, eye color, auto-generated social security number, license plate and driver's license)
- Add multiple vehicles per character (make, model, color, condition, license plate from GTA5)
- Register guns to characters with serial numbers
- View all your characters with comprehensive profiles including personal info, physical description, identification, contact/address, inventory counts, arrest history, wanted status, and medical info

**LEO Features (`/leodatabase`):**
- Search license plates to view full character profiles
- Search character names to view profiles
- View wanted list of all suspects
- Only available if roleplay commands are enabled and user has LEO role

**CAD Configuration (through `/roleplaycommandsetup`):**
- Staff configures CAD through `/roleplaycommandsetup` → select "CAD"
- Separate `/cadcharacter` command for members to create characters and add vehicles/guns
- Separate `/cadlicensesearch [plate]` command for LEO to search license plates
- Each server has independent CAD configuration

**UI/UX Decisions:**
- All bot responses leverage Discord embeds for a clean, professional, and branded user interface.
- Embeds consistently feature "EverLink" branding in the footer.
- Interactive elements like dropdowns and modals are used for configuration and reporting (e.g., verification setup, 911 reports).

**Technical Implementations & Feature Specifications:**
- **Modular System Design:** Features like Staff Management, Verification, Welcome, 911 Reporting, Logging, Strike System, Priority Tracker, Roleplay Calendar, Sticky Messages, Anti-Promoting, Reaction Roles, and Ticket Support are implemented as independent, per-server configurable modules.
- **Permission System:** Commands are gated by Discord Administrator permissions or a custom staff database, ensuring secure access.
- **Logging System:** A central log channel (`/setlogchannel`) is mandatory and used by all other systems for event reporting (e.g., verification answers, anti-promoting incidents, strike actions).
- **Verification System:** Supports customizable RP tags, questions, welcome messages, and automatic role assignment.
- **Strike System:** Features a multi-level strike configuration (1-4) with customizable actions (role assignment, kick, timeout, ban) and durations per level.
- **Priority Tracker:** Provides real-time status updates for "priority" events with cooldowns and custom messages.
- **Roleplay Calendar:** Manages and displays weekly RP events with automatic timezone conversion using 12-hour AM/PM format. Displays times as Discord timestamps that auto-convert to each user's local timezone.
- **Sticky Messages:** Staff/admins can use `/sticky` to create messages that auto-repost every 1 message to keep important information visible. Messages are prefixed with "__**Stickied Message:**__" header.
- **Anti-Promoting System:** Automatically detects and removes non-whitelisted Discord invite links, with an optional staff bypass.
- **Reaction Role System:** Staff/admins can use `/reactionrolemessage` to create messages with emoji reactions that automatically assign roles. Up to 5 emoji-role pairs per message. Menu-based workflow: "Send a New Message" creates a reaction role message, "Add Emoji to Existing Message" adds emoji-role pairs via modals. Requires `GatewayIntentBits.GuildMessageReactions` intent to receive reaction events.
- **Ticket Support System:** Staff/admins can use `/ticketsupportenable` (requires log channel configured) to enable the system, then `/ticketsupportsetup` to configure it. Setup includes:
  - Customizing panel title and description
  - Selecting a channel for the ticket panel
  - Adding custom ticket types with:
    - Choosing button color (Primary Blue, Secondary Gray, Success Green, or Danger Red)
    - Role access control
    - Option to include bot staff (all users/roles on the bot's staff list automatically get access to that ticket type)
  
  When users click a button on the panel, they enter a description modal to provide details about their issue. A private ticket channel is created only visible to the user, assigned roles, and any bot staff members (if selected for that type). The ticket description is displayed in a welcome embed with two action buttons:
  - **✅ Close Ticket** - Changes the status to closed, locks the channel (no one can type), and replaces the close button with a delete button
  - **🗑️ Delete Ticket** - Permanently deletes the ticket record and the channel
  
  Tickets are logged and tracked in the database with status tracking (open/closed), closure date, and who closed it.

  **Enable/Disable Ticket Support:**
  - Staff runs `/ticketsupportenable true` or `/ticketsupportenable false` to enable/disable the entire system
  - When disabled, members can no longer create tickets
  - When enabled, staff runs `/ticketsupportsetup` to configure the panel
  
  **Setup Process:** After each setup step, the menu automatically returns to the main setup menu for seamless navigation. Staff can:
  - Add multiple ticket types, each with custom names, individual button colors, and role access
  - Remove ticket types during setup (via the "Remove Ticket Type" option)
  - Before sending a panel, choose which ticket types to include (not all types need to be on every panel)
  - Send panels to different channels with different ticket type combinations
  - Each ticket type button displays with its custom color on the panel
  - The channel selection automatically resets after sending, allowing immediate setup of another panel
- **Database Integration:** Mongoose schemas define the data models for each system (Staff, Verification, Welcome, Config, StrikeUser, StrikeConfig, Priority, RoleplayCalendar, Sticky, ReactionRole, TicketConfig, Ticket, RoleplayCommands), ensuring per-server data isolation and persistence.

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