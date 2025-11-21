# SΛRP Discord Bot

## Overview
Discord bot for the SΛRP GTA 5 PS5 Roleplay Community. This bot provides staff management functionality with a permission system that allows administrators to add/remove staff members and roles. All bot responses use Discord embeds with SΛRP branding.

## Current State
- **Status**: In Development
- **Stack**: Node.js (v20) + Discord.js v14 + MongoDB Atlas
- **Last Updated**: November 21, 2025

## Features Implemented
1. **Staff Management System**
   - `/addstaff` - Administrators can add users or roles as bot staff
   - `/removestaff` - Administrators can remove users or roles from bot staff
   - `/stafflist` - Staff members can view all current bot staff (staff-only command)

2. **911 Report System**
   - `/911` - Submit a 911 report form (modal popup with fields: Issue, Location, Suspects, Description, Contact)
   - `/setreportchannel` - Admins set the channel where 911 reports are sent
   - `/addreportrole` - Admins add roles to ping for reports (LEO, EMS, etc.)
   - `/removereportrole` - Admins remove roles from report pings
   - Reports sent as embeds to configured channel with role mentions

3. **San Andreas Report System**
   - `/sareport` - Submit a San Andreas Report via two-part modal form
     - Part 1: Suspect, Vehicle, Date & Time, Location, Summary of Events
     - Part 2: Violations, Fine Amount, Jail Time, Notes, Officer Callsign & Agency
   - `/sareportchannel` - Admins set the channel where SA reports are sent
   - `/addsareportrole` - Admins add roles to ping for SA reports (optional)
   - `/removesareportrole` - Admins remove roles from SA report pings
   - Reports formatted with the official San Andreas Report template

4. **Permission System**
   - Admin-only commands (requires Discord Administrator permission)
   - Staff-only commands (requires being in staff database OR admin permission)
   - Role-based staff access (members with staff roles can use staff commands)
   - All responses formatted as Discord embeds

5. **Database**
   - MongoDB Atlas integration via Mongoose
   - Staff model: type, userId, username, roleId, roleName, addedBy, addedAt
   - Config model: guildId, reportChannelId, reportRoles, saReportChannelId, saReportRoles

## Project Structure
```
src/
├── index.js                  # Main bot entry point
├── config/
│   └── database.js          # MongoDB connection configuration
├── models/
│   ├── Staff.js             # Mongoose schema for staff members
│   └── Config.js            # Mongoose schema for server config
├── commands/
│   ├── addstaff.js          # Add staff command
│   ├── removestaff.js       # Remove staff command
│   ├── stafflist.js         # List all staff command
│   ├── 911.js               # 911 report form command
│   ├── setreportchannel.js  # Set report channel command
│   ├── addreportrole.js     # Add report role command
│   ├── removereportrole.js  # Remove report role command
│   ├── sareport.js          # San Andreas report form command (2-part)
│   ├── sareportchannel.js   # Set SA report channel command
│   ├── addsareportrole.js   # Add SA report role command
│   └── removesareportrole.js # Remove SA report role command
├── handlers/
│   └── modalHandler.js      # Modal submission handler
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
- SΛRP branding on all embeds (footer: "SΛRP GTA 5 PS5 Roleplay")
- MongoDB for persistent data storage
- GTA 5 roleplay community focus

## Next Steps
- Additional roleplay-specific commands
- Logging system for staff actions
- Configuration commands for customization
- Prepare for Koyeb deployment
