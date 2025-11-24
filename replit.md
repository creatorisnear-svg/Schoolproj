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
All roleplay commands and CAD features are accessed exclusively through three menu-based database commands: `/civiliandatabase` (civilians), `/leodatabase` (LEO only), and `/firedepartmentdatabase` (Fire Department only).

**Setup Process:**
1. Staff runs `/roleplaycommandsenable true` to enable the roleplay commands system
2. Staff runs `/roleplaycommandsetup` to configure channels and roles:
   - **🚨 911 & CAD - Emergency/Dispatch** → Combined setup for emergency reporting and CAD system:
     - Select 911 Channel for emergency reports
     - Set LEO Roles (automatically pinged on 911 reports)
     - Set Fire Department Roles (automatically pinged on 911 reports)
     - Set Staff Roles for system management
   - **🐦 Twitter - Public Messages** → Select channel for public OOC posts  
   - **🤫 Anon - Anonymous Messages** → Select channel for anonymous/black market messages
   - **✅ Done - Close Setup** → Finish configuration

**Member Access (Civilians) - `/civiliandatabase`:**
All civilian roleplay and CAD interactions are handled through a single menu with options to:
- 🚨 Report 911 Emergency - Submit emergency with form modal
- 🐦 Post to Twitter - Share public OOC message
- 🤫 Post Anonymously - Post anonymous/black market message
- 👤 Create Character - Create a new civilian/character profile
- 🚗 Add Vehicle - Add a vehicle to an existing character
- 🔫 Add Firearm - Register a gun/weapon to an existing character
- 📋 Manage Character - View all characters and their details (vehicles, weapons)

**LEO Access - `/leodatabase`:**
- 🚨 View Active 911 Calls - See all active emergency calls with response options
  - **Respond as Primary:** Claim the call (only one primary responder per call)
  - **Attach to Call:** Join the call as supporting unit (multiple can attach)
- 🔍 Search License Plate - Look up character profiles by vehicle plate
- 👤 Search Character Name - Search for character profiles by name
- 📋 View Wanted List - See all wanted suspects
- Only available if roleplay commands are enabled and user has LEO role

**Fire Department Access - `/firedepartmentdatabase`:**
- 🚨 View Active 911 Calls - See all active emergency calls with response options
  - **Respond as Primary:** Claim the call
  - **Attach to Call:** Join the call as supporting unit
- 👤 Create FD Character - Create a fire department character profile
- 🚗 Add Vehicle - Add a vehicle to an existing FD character

**Emergency System Features:**
- **911 Call Tracking:** All emergency calls tracked with unique IDs
- **Primary Response:** First LEO to claim primary is marked as main responder
- **Unit Attachment:** Other LEOs can attach as supporting units
- **Role Pinging:** Configured LEO and Fire Department roles automatically pinged on 911 reports
- **Interactive 911 Messages:** 911 reports include 3 buttons in the 911 channel:
  - 🚨 **Respond** - LEO claims as primary responder (updates message)
  - 📎 **Attach** - LEO joins as supporting unit (updates message)
  - ❌ **Dismiss** - Close call if help no longer needed (removes buttons)
- **LEO Database Integration:** When LEO responds/attaches via `/leodatabase`, the original 911 message in the 911 channel updates automatically
- **Auto-Delete:** All 911 calls auto-delete after 10 minutes
- **Setup Flow:** `/roleplaycommandsetup` → Select "🚨 911 & CAD" → Configure 911 channel and roles

**CAD System (Computer Aided Dispatch):**
Full GTA5 RP CAD system with character and vehicle management for LEO/Fire Department roleplay accessed through database menus.

**UI/UX Decisions:**
- All bot responses leverage Discord embeds for clean, professional, branded interface
- Embeds consistently feature "EverLink" branding in footer
- Interactive elements use Discord dropdown selectors, modals, and buttons
- Configuration fallback messages for unconfigured features

**Configuration Fallback System:**
- All menu-based features include automatic configuration checks
- If a feature is not configured, users see: "This feature has not been set up by administrators. Please contact a server admin."
- Applies to 911 system, Twitter, Anonymous messages, and all roleplay systems

**Technical Implementations & Feature Specifications:**
- **Modular System Design:** Features are independent, per-server configurable modules
- **Permission System:** Commands gated by Discord Administrator permissions or custom staff database
- **Logging System:** Central log channel (`/setlogchannel`) used by all systems for event reporting
- **Verification System:** Customizable RP tags, questions, welcome messages, automatic role assignment
- **Strike System:** Multi-level (1-4) with customizable actions (role assignment, kick, timeout, ban) and durations
- **Priority Tracker:** Real-time status updates for priority events with cooldowns
- **Roleplay Calendar:** Weekly RP events with automatic timezone conversion (12-hour AM/PM format)
- **Sticky Messages:** Auto-reposts every 1 message with "__**Stickied Message:**__" prefix
- **Anti-Promoting System:** Detects/removes non-whitelisted Discord invite links with staff bypass option
- **Reaction Role System:** Up to 5 emoji-role pairs per message with menu-based workflow
- **Ticket Support System:** Custom ticket types with role access control, automatic channel creation, ticket tracking
- **Database Integration:** Mongoose schemas ensure per-server data isolation and persistence

**Setup Command Flow:**
```
/roleplaycommandsenable true
  ↓
/roleplaycommandsetup (staff only)
  ↓
Main Setup Menu:
  - 🚨 911 & CAD - Emergency/Dispatch
  - 🐦 Twitter - Public Messages
  - 🤫 Anon - Anonymous Messages
  - ✅ Done - Close Setup
  ↓
If 911 & CAD selected:
  Emergency Setup Menu:
    - 🚑 Select 911 Channel
    - 🚔 Set LEO Roles
    - 🚒 Set Fire Department Roles
    - 👮 Set Staff Roles
    - ✅ Done - Back to Main Menu
```

**Project Structure:**
The codebase is organized into `src/` containing:
- `index.js`: Main bot entry point with event routing
- `config/`: Database connection configuration
- `models/`: Mongoose schemas for all data (RoleplayCommands, CADConfig, EmergencyCall, etc.)
- `commands/`: Individual slash command files grouped by feature
- `handlers/`: Event logic for modal submissions, select menus, and system functionalities
- `utils/`: Helper functions for embeds, permissions, and utility functions

**Key Handlers for Roleplay/CAD System:**
- `roleplayCommandsHandler.js`: Main setup menus (Emergency, Twitter, Anon) and channel/role selection
- `emergencySetupMenu`: Handles 911 & CAD setup submenu with 4 role/channel configuration options
- `civiliandatabaseHandler.js`: Civilian database menu routing
- `leoDatabaseHandler.js`: LEO database menu and 911 call viewing
- `fireDepartmentHandler.js`: Fire Department database menu and 911 call viewing
- `cadHandler.js`: Character creation and vehicle/firearm management for all roles

## Recent Changes (Session: November 24, 2025 - Continued)
- **Implemented:** Interactive button system for 911 messages with 3 response options:
  - 🚨 **Respond** - LEO claims as primary responder (updates message in real-time)
  - 📎 **Attach** - LEO joins as supporting unit (shows all attached units)
  - ❌ **Dismiss** - Close call and remove buttons
- **Implemented:** Cross-channel message synchronization
  - When LEO responds via `/leodatabase`, original 911 message in 911 channel updates automatically
  - When LEO attaches via `/leodatabase`, all responders and attached units display on original message
  - Message shows: `**🚨 PRIMARY:** Zoktu` and `**📎 ATTACHED:** Mike, John`
- **Implemented:** Auto-delete system for 911 calls
  - All 911 calls automatically delete after 10 minutes
  - System checks every 60 seconds
  - Applies to all calls regardless of response status
- **Added:** EmergencyCall model fields for message tracking
  - `messageId`: Stores Discord message ID of 911 announcement
  - `channelId`: Stores 911 channel ID for message updates
- **Created:** emergencyButtonHandler.js for managing 911 channel buttons
  - Handles Respond, Attach, and Dismiss button interactions
  - Updates database and original 911 message in real-time
- **Updated:** LEO database handlers to sync with 911 messages
  - handleLEOPrimaryResponse: Updates 911 message when responding
  - handleLEOAttachResponse: Updates 911 message with all attached units
  - Proper error handling if message/channel not found

## External Dependencies
- **Discord.js v14:** Primary library for interacting with Discord API
- **MongoDB Atlas:** Cloud-hosted NoSQL database
- **Mongoose:** Object Data Modeling library for MongoDB
- **Express:** HTTP server for health checks
- **Dotenv:** Environment variable management
