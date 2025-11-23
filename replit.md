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
   - `/verifysystemsetup` - Configure verification with dropdown menus (staff-only)
   - `/verify` - Members click button to verify and get access to the server
   - RP Tag system: Auto-formats nicknames as "[TAG] | [username]" upon verification
   - Customizable verification questions and DM messages
   - Automatic role assignment (removes unverified, adds verified role)
   - Welcome channel messages sent after verification
   - Each server has independent verification settings and RP tags

3. **Welcome System** (Per-Server)
   - `/welcomesystemsetup` - Configure welcome channel using dropdown selector (staff-only)
   - `/setwelcomemessage` - Customize the welcome message in channel (staff-only)
   - `/setwelcomedm` - Customize the welcome DM sent to new members (staff-only)
   - Automatic welcome messages with profile picture embed (non-customizable)
   - DM sent to new members with profile picture embed (non-customizable)
   - Placeholders: {user} for mention/username, {server} for server name
   - Default messages provided if not customized

4. **911 Report System** (Per-Server)
   - `/911` - Submit a 911 report form (modal popup with fields: Issue, Location, Suspects, Description, Contact)
   - `/set911channel` - Staff set the channel where 911 reports are sent
   - `/add911role` - Staff add roles to ping for reports (LEO, EMS, etc.)
   - `/remove911role` - Staff remove roles from report pings
   - Reports sent as embeds to configured channel with role mentions

5. **Permission System**
   - Admin-only commands (requires Discord Administrator permission)
   - Staff-only commands (requires being in staff database OR admin permission)
   - Role-based staff access (members with staff roles can use staff commands)
   - All responses formatted as Discord embeds
   - Per-server permission checking

6. **Database** (Per-Server Storage)
   - MongoDB Atlas integration via Mongoose
   - Staff model: guildId, type, userId, username, roleId, roleName, addedBy, addedAt
   - Verification model: guildId, verifyChannelId, welcomeChannelId, unverifiedRoleId, verifiedRoleId, rpTag, customQuestion, verifyDMMessage
   - Welcome model: guildId, channelId, welcomeMessage, welcomeDM
   - Config model: guildId, reportChannelId, reportRoles

## Project Structure
```
src/
├── index.js                  # Main bot entry point
├── config/
│   └── database.js          # MongoDB connection configuration
├── models/
│   ├── Staff.js             # Mongoose schema for staff members
│   ├── Verification.js      # Mongoose schema for verification config
│   ├── Welcome.js           # Mongoose schema for welcome config
│   └── Config.js            # Mongoose schema for server config
├── commands/
│   ├── addstaff.js          # Add staff command
│   ├── removestaff.js       # Remove staff command
│   ├── stafflist.js         # List all staff command
│   ├── verifysystemsetup.js # Verification system setup command
│   ├── verify.js            # Verification button command
│   ├── welcomesystemsetup.js # Welcome system setup command
│   ├── setwelcomemessage.js # Set welcome message command
│   ├── setwelcomedm.js      # Set welcome DM command
│   ├── 911.js               # 911 report form command
│   ├── set911channel.js     # Set 911 report channel command
│   ├── add911role.js        # Add 911 report role command
│   └── remove911role.js     # Remove 911 report role command
├── handlers/
│   ├── modalHandler.js      # Modal submission handler
│   └── selectMenuHandler.js # Select menu handler
└── utils/
    ├── embedBuilder.js      # Helper functions for creating embeds
    └── permissions.js       # Permission checking utilities
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
