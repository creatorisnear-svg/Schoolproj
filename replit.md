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
- 🚨 View Active BOLOs - See all current "Be On the Lookout" alerts
- 🔫 Revoke Weapon - Remove a registered firearm from a character
- 🎫 Issue Traffic Ticket - Issue traffic citations with violation details and fines
- 🚨 Create BOLO - Create "Be On the Lookout" alerts for wanted persons (with vehicle info)
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

## Recent Changes (Session: November 24, 2025 - Multi-Step Character Creation, Traffic Tickets, BOLO Display, Status Alerts, Navigation & UX Improvements)
- **Character Creation Redesigned as 3-Step Process:**
  - **Step 1/3 - Basic Info:** Modal with Name, Age, Gender fields
    - Name auto-capitalized (first and last names)
    - User clicks "📝 Continue Character Setup" button to proceed
  - **Step 2/3 - Physical Description:** Modal with Height and Race fields
    - Height field supports entries like "5'10"", "6 feet", etc.
    - Race field supports entries like "African American", "Asian", etc.
    - Both fields optional
    - After submission, user proceeds to status selection
  - **Step 3/3 - Final Setup:** Two button rows for status selection
    - **License Status Row:** "✅ Valid License" or "❌ Invalid License" (required selection)
    - **Special Status Row:** "🎖️ Veteran", "❤️ Organ Donor", or "✅ Done" (now clear button to finish)
    - Users can click "✅ Done" to complete without selecting special status
- **Character Profile Structure:**
  - All fields properly saved with height in `height` field, race in `distinguishingFeatures`
  - SSN auto-generated only (no license plate or driver's license auto-generation)
  - License status defaults to 'valid', veteran status defaults to 'none'
- **LEO Character Search Display - FULLY ENHANCED:**
  - ✅ Traffic Tickets now display correctly with violation type and fine amount
  - **New BOLO Section:** Shows active BOLOs on character profile when searching
    - **Displays:** BOLO ID, Reason, Date issued, Who issued it, and details
    - **Example:** "🚨 BOLO ALERTS - TKT-123456 - Armed & Dangerous - Issued: 11/24/2024 by Officer Name - Details: Last seen at..."
    - BOLOs appear between Weapons and Traffic Tickets sections
  - **Status Alert System:**
    - **Red Embed:** When character has BOLO or is wanted (instant visual alert)
    - **Status Shows:** "🚨 **BOLO ALERT**" when BOLO exists, overrides wanted status display
    - Provides clear warning to LEOs that person has active alert
- **Navigation & UX Improvements:**
  - ✅ After character creation completes → Returns to civilian database main menu
  - ✅ After character deletion → Returns to civilian database main menu with success message
  - ✅ Delete confirmation now shows proper info styling (not error style)
  - ✅ Character complete message says "has been created successfully! You can now add vehicles or weapons."
  - ✅ All responses keep user in database system for easy chaining of actions
- **Bug Fixes:**
  - ✅ Fixed character deletion not working (button check order issue in index.js - now checks 'char_delete_confirm_' before 'char_delete_')
  - ✅ 911 reporting in civilian database working correctly (modal handler properly routes and processes reports)
- **Updated Handlers:**
  - `cadHandler.js` - Redesigned character creation with 3-step process, returns to main menu on completion
  - `leoDatabaseHandler.js` - Fixed traffic ticket display (violation/fine fields), added BOLO display, red embed on BOLO/wanted, status alert
  - `civilianDatabaseHandler.js` - Fixed delete confirmation styling, returns to main menu after deletion
  - `index.js` - Added routing for new handlers, fixed button check order for character deletion
- **Result:** Bot maintains zero warnings, 34 commands registered, all features fully operational with improved UX flow

## External Dependencies
- **Discord.js v14:** Primary library for interacting with Discord API
- **MongoDB Atlas:** Cloud-hosted NoSQL database
- **Mongoose:** Object Data Modeling library for MongoDB
- **Express:** HTTP server for health checks
- **Dotenv:** Environment variable management
