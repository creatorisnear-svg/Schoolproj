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

2. **Permission System**
   - Admin-only commands (requires Discord Administrator permission)
   - Staff-only commands (requires being in staff database OR admin permission)
   - All responses formatted as Discord embeds

3. **Database**
   - MongoDB Atlas integration via Mongoose
   - Staff model tracks: userId, username, roleId, roleName, addedBy, addedAt

## Project Structure
```
src/
├── index.js                  # Main bot entry point
├── config/
│   └── database.js          # MongoDB connection configuration
├── models/
│   └── Staff.js             # Mongoose schema for staff members
├── commands/
│   ├── addstaff.js          # Add staff command
│   ├── removestaff.js       # Remove staff command
│   └── stafflist.js         # List all staff command
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
