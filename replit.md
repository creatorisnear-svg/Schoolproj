# EverLink Discord Bot

## Overview
Discord bot for multi-server roleplay/gaming communities (specifically GTA5 RP servers with LEO/EMS). Provides emergency reporting, member verification with RP tags, staff management, and welcome systems. Each server has independent configuration including staff teams, verification settings, and RP tags. All bot responses use Discord embeds with EverLink branding.

## Current State
- **Status**: Active Development
- **Stack**: Node.js (v20) + Discord.js v14 + MongoDB Atlas
- **Last Updated**: November 23, 2025

## Features Implemented
1. **Staff Management System** (Per-Server)
   - `/addstaff` - Administrators can add users or roles as bot staff
   - `/removestaff` - Administrators can remove users or roles from bot staff
   - `/stafflist` - Staff members can view all current bot staff (staff-only command)
   - Each server has its own independent staff team

2. **Verification System** (Per-Server)
   - `/verifysystem` - Enable/disable the verification system (admin-only)
   - `/verifysystemsetup` - Configure verification with dropdown menus (requires system enabled)
   - `/verify` - Members click button to verify and get access to the server (requires system enabled)
   - RP Tag system: Auto-formats nicknames as "[TAG] | [username]" upon verification
   - Customizable verification questions and DM messages
   - Automatic role assignment (removes unverified, adds verified role)
   - Welcome channel messages sent after verification
   - Each server has independent verification settings and RP tags

3. **Welcome System** (Per-Server)
   - `/welcomesystem` - Enable/disable the welcome system (staff-only)
   - `/welcomesystemsetup` - Configure welcome channel using dropdown selector (requires system enabled)
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

5. **Anti-Promoting System** (Per-Server)
   - `/antipromotingenable` - Staff enable anti-promoting and set log channel
   - `/whitelistlink` - Staff add/remove allowed invite links to whitelist
   - `/staffwhitelistlink` - Admin add/remove staff members to invite whitelist
   - `/whitelistlinkstaff true/false` - Admin toggle whether staff can bypass anti-promoting
   - Auto-detects Discord invite links in messages
   - Deletes messages containing non-whitelisted invite links
   - DMs user with formatted embed explaining deletion
   - Logs incident to configured channel with user and link details
   - Default: Staff members can share links (enabled). Admins can disable via `/whitelistlinkstaff false`

6. **Permission System**
   - Admin-only commands (requires Discord Administrator permission)
   - Staff-only commands (requires being in staff database OR admin permission)
   - Role-based staff access (members with staff roles can use staff commands)
   - All responses formatted as Discord embeds
   - Per-server permission checking

7. **System Enable/Disable** (Per-Server)
   - Verification and welcome systems must be enabled before setup
   - Disabled systems are completely non-functional (no automatic features)
   - Toggle with `/verifysystem enabled:true/false` and `/welcomesystem enabled:true/false`
   - All responses use Discord embeds for clean, professional UI

8. **Database** (Per-Server Storage)
   - MongoDB Atlas integration via Mongoose
   - Staff model: guildId, type, userId, username, roleId, roleName, addedBy, addedAt
   - Verification model: guildId, enabled, verifyChannelId, welcomeChannelId, unverifiedRoleId, verifiedRoleId, rpTag, customQuestion, verifyDMMessage
   - Welcome model: guildId, enabled, channelId, welcomeMessage, welcomeDM
   - Config model: guildId, reportChannelId, reportRoles, antiPromotingEnabled, antiPromotingLogChannelId, whitelistedInviteLinks, whitelistedStaffIds, staffCanBypassLinks

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
│   └── Config.js            # Mongoose schema for server config
├── commands/
│   ├── addstaff.js          # Add staff command
│   ├── removestaff.js       # Remove staff command
│   ├── stafflist.js         # List all staff command
│   ├── verifysystem.js      # Toggle verification system enabled/disabled
│   ├── verifysystemsetup.js # Verification system setup command
│   ├── verify.js            # Verification button command
│   ├── welcomesystem.js     # Toggle welcome system enabled/disabled
│   ├── welcomesystemsetup.js # Welcome system setup command
│   ├── antipromotingenable.js # Enable anti-promoting command
│   ├── whitelistlink.js     # Whitelist/remove invite links command
│   ├── staffwhitelistlink.js # Whitelist/remove staff members command
│   ├── whitelistlinkstaff.js # Toggle staff bypass for anti-promoting command
│   ├── 911.js               # 911 report form command
│   ├── set911channel.js     # Set 911 report channel command
│   ├── add911role.js        # Add 911 report role command
│   └── remove911role.js     # Remove 911 report role command
├── handlers/
│   ├── modalHandler.js      # Modal submission handler (checks enabled status)
│   ├── selectMenuHandler.js # Select menu handler (checks enabled status)
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

## Next Steps
- Additional roleplay-specific commands
- Logging system for staff actions
- Configuration commands for customization
- Prepare for Koyeb deployment
