# EverLink Discord Bot

## Overview
Discord bot for multi-server roleplay/gaming communities (specifically GTA5 RP servers with LEO/EMS). Provides emergency reporting, member verification with RP tags, staff management, and welcome systems. Each server has independent configuration including staff teams, verification settings, and RP tags. All bot responses use Discord embeds with EverLink branding.

## Current State
- **Status**: Active Development
- **Stack**: Node.js (v20) + Discord.js v14 + MongoDB Atlas
- **Last Updated**: November 23, 2025

## Features Implemented
**REQUIRED FIRST STEP**: `/setlogchannel` - All systems require a log channel to be set before they can be enabled

**NEW**: Strike System with 4 configurable levels, each with optional roles and actions (kick/timeout/ban)

1. **Staff Management System** (Per-Server)
   - `/addstaff` - Administrators can add users or roles as bot staff
   - `/removestaff` - Administrators can remove users or roles from bot staff
   - `/stafflist` - Staff members can view all current bot staff (staff-only command)
   - Each server has its own independent staff team

2. **Verification System** (Per-Server)
   - `/verifysystem true/false` - Enable/disable the verification system (admin-only, requires log channel first)
   - `/verifysystemsetup` - Configure verification with dropdown menus (requires log channel and system enabled)
   - `/verify` - Members click button to verify and get access to the server (requires system enabled)
   - RP Tag system: Auto-formats nicknames as "[TAG] | [username]" upon verification
   - Customizable verification questions and DM messages
   - When member answers a custom verification question, it's logged to the log channel
   - Automatic role assignment (removes unverified, adds verified role)
   - Welcome channel messages sent after verification
   - Each server has independent verification settings and RP tags

3. **Welcome System** (Per-Server)
   - `/welcomesystem true/false` - Enable/disable the welcome system (staff-only, requires log channel first)
   - `/welcomesystemsetup` - Configure welcome channel using dropdown selector (requires log channel and system enabled)
   - Automatic welcome messages with profile picture embed (non-customizable)
   - DM sent to new members with profile picture embed (non-customizable)
   - Placeholders: {user} for mention/username, {server} for server name
   - Default messages provided if not customized
   - Disabled systems don't send welcome messages to new members

4. **911 Report System** (Per-Server)
   - `/911` - Submit a 911 report form (modal popup with fields: Issue, Location, Suspects, Description, Contact)
   - `/set911channel` - Staff set the channel where 911 reports are sent
   - `/add911role` - Staff add roles to ping for reports (LEO, EMS, etc.)
   - `/remove911role` - Staff remove roles from report pings
   - Reports sent as embeds to configured channel with role mentions

5. **Logging System** (Per-Server, REQUIRED)
   - `/setlogchannel` - Staff set the main log channel for all server events (verification questions, anti-promoting reports, etc.)
   - MUST be set before enabling ANY other systems (verification, welcome, anti-promoting)
   - All systems use this single log channel for event logging
   - Verification questions with answers logged when members verify
   - Anti-promoting reports logged with user and link details

6. **Strike System** (Per-Server)
   - `/enablestrikesystem true/false` - Enable/disable the strike system (admin-only, requires log channel first)
   - `/strikesystemsetup` - Configure strike system with dropdown menus (requires log channel and system enabled)
   - Strike Levels 1-4 with optional configuration:
     - Each level can have an optional role assignment
     - Each level can have an action: Kick, Timeout (mute), or Ban
     - Timeout and Ban durations are configurable in minutes (0 = permanent for ban)
   - `/strike @user <strikes> <reason>` - Staff can strike members (1-4 strikes)
   - **Strike Replacement Logic**: New strike level replaces old (e.g., strike 2 replaces strike 1, not stacking)
   - All strikes logged to configured log channel with member, striker, reason, and action taken
   - Each server has independent strike configuration

7. **Anti-Promoting System** (Per-Server)
   - `/antipromotingenable true/false` - Staff enable or disable anti-promoting (requires log channel set first)
   - `/whitelistlink add/remove` - Staff add/remove allowed invite links to whitelist
   - `/whitelistlinkstaff true/false` - Admin toggle whether staff can bypass anti-promoting
   - Auto-detects Discord invite links in messages
   - Deletes messages containing non-whitelisted invite links
   - DMs user with formatted embed explaining deletion
   - Logs incident to configured log channel with user and link details
   - Default: Staff members can share links (enabled). Admins can disable via `/whitelistlinkstaff false`

8. **Permission System**
   - Admin-only commands (requires Discord Administrator permission)
   - Staff-only commands (requires being in staff database OR admin permission)
   - Role-based staff access (members with staff roles can use staff commands)
   - All responses formatted as Discord embeds
   - Per-server permission checking

9. **System Enable/Disable** (Per-Server)
   - All systems must have log channel set before enabling
   - Verification, welcome, and strike systems must be enabled before setup
   - Disabled systems are completely non-functional (no automatic features)
   - All responses use Discord embeds for clean, professional UI

10. **Database** (Per-Server Storage)
   - MongoDB Atlas integration via Mongoose
   - Staff model: guildId, type, userId, username, roleId, roleName, addedBy, addedAt
   - Verification model: guildId, enabled, verifyChannelId, welcomeChannelId, unverifiedRoleId, verifiedRoleId, rpTag, customQuestion, verifyDMMessage
   - Welcome model: guildId, enabled, channelId, welcomeMessage, welcomeDM
   - Config model: guildId, reportChannelId, reportRoles, antiPromotingEnabled, whitelistedInviteLinks, whitelistedStaffIds, staffCanBypassLinks, logChannelId
   - StrikeUser model: guildId, userId, currentStrikeLevel (0-4)
   - StrikeConfig model: guildId, enabled, strikes (4 levels with roleId, action, duration)

## Project Structure
```
src/
├── index.js                  # Main bot entry point
├── config/
│   └── database.js          # MongoDB connection configuration
├── models/
│   ├── Staff.js             # Mongoose schema for staff members
│   ├── Verification.js      # Mongoose schema for verification config (with enabled field)
│   ├── Welcome.js           # Mongoose schema for welcome config (with enabled field)
│   ├── Config.js            # Mongoose schema for server config
│   └── Strike.js            # Mongoose schema for strike system (StrikeUser and StrikeConfig)
├── commands/
│   ├── addstaff.js          # Add staff command
│   ├── removestaff.js       # Remove staff command
│   ├── stafflist.js         # List all staff command
│   ├── setlogchannel.js     # Set log channel command
│   ├── verifysystem.js      # Toggle verification system enabled/disabled
│   ├── verifysystemsetup.js # Verification system setup command
│   ├── verify.js            # Verification button command
│   ├── welcomesystem.js     # Toggle welcome system enabled/disabled
│   ├── welcomesystemsetup.js # Welcome system setup command
│   ├── enablestrikesystem.js # Toggle strike system enabled/disabled
│   ├── strikesystemsetup.js # Strike system setup command
│   ├── strike.js            # Strike member command
│   ├── antipromotingenable.js # Toggle anti-promoting command
│   ├── whitelistlink.js     # Whitelist/remove invite links command
│   ├── whitelistlinkstaff.js # Toggle staff bypass for anti-promoting command
│   ├── 911.js               # 911 report form command
│   ├── set911channel.js     # Set 911 report channel command
│   ├── add911role.js        # Add 911 report role command
│   └── remove911role.js     # Remove 911 report role command
├── handlers/
│   ├── modalHandler.js      # Modal submission handler (checks enabled status, logs verification questions)
│   ├── selectMenuHandler.js # Select menu handler with strike system setup (checks enabled status)
│   └── antiPromotingHandler.js # Anti-promoting message handler
└── utils/
    ├── embedBuilder.js      # Helper functions for creating embeds
    ├── permissions.js       # Permission checking utilities
    └── inviteDetector.js    # Utility to detect Discord invite links
```

## Environment Variables Required
- `DISCORD_TOKEN` - Discord bot token from Discord Developer Portal
- `MONGODB_URI` - MongoDB Atlas connection string

**Note**: User dismissed the Replit Discord integration. Using manual secret management instead via the Secrets panel.

## Setup Instructions
1. Create a Discord bot at https://discord.com/developers/applications
2. Enable required intents: Guilds, Guild Members
3. Generate bot token and add to environment
4. Create MongoDB Atlas cluster and get connection string
5. Invite bot to server with proper permissions

## Deployment Target
Planned deployment to **Koyeb** after all commands are implemented.

## User Preferences
- All bot responses must use Discord embeds
- EverLink branding on all embeds (footer: "EverLink")
- MongoDB for persistent data storage

## Usage Flow (Recommended Order)
1. `/setlogchannel` → Select log channel (REQUIRED for all other systems)
2. `/verifysystem true` → Enable verification, then `/verifysystemsetup` → Configure
3. `/welcomesystem true` → Enable welcome, then `/welcomesystemsetup` → Configure  
4. `/enablestrikesystem true` → Enable strikes, then `/strikesystemsetup` → Configure (roles + actions)
5. `/antipromotingenable true` → Enable anti-promoting (auto-uses log channel)
6. `/addstaff` → Add staff members to manage bot commands

## Next Steps
- Additional roleplay-specific commands
- Configuration dashboard for staff
- Logging system for staff actions
- Prepare for Koyeb deployment
