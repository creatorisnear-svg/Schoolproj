# SARP Core Discord Bot Setup Guide

## Quick Start

### 1. Get Your Discord Bot Token
1. Go to https://discord.com/developers/applications
2. Click "New Application" and name it "SARP Core Bot"
3. Go to the "Bot" section in the left sidebar
4. Click "Reset Token" to generate your bot token
5. **Important**: Enable these intents under "Privileged Gateway Intents":
   - ✅ Server Members Intent
   - ✅ Message Content Intent
6. Copy the bot token

### 2. Set Up MongoDB Atlas
1. Go to https://www.mongodb.com/cloud/atlas/register
2. Create a free account and cluster
3. Click "Connect" → "Connect your application"
4. Your connection string format will be:
   ```
   mongodb+srv://SA:SA@your-cluster-name.xxxxx.mongodb.net/sarp?retryWrites=true&w=majority
   ```
   Replace `your-cluster-name.xxxxx` with your actual cluster address from Atlas

### 3. Add Secrets to Replit
Click the "Secrets" tab (lock icon) in Replit and add:
- **DISCORD_TOKEN**: Your bot token from step 1
- **MONGODB_URI**: Your MongoDB connection string from step 2

### 4. Invite Bot to Your Server
1. Go back to Discord Developer Portal → Your Application → OAuth2 → URL Generator
2. Select scopes: `bot`, `applications.commands`
3. Select bot permissions: `Administrator` (or minimum: Send Messages, Embed Links, Use Slash Commands)
4. Copy the generated URL and open it to invite the bot to your server

### 5. Run the Bot
Once secrets are added, the bot will automatically start. Check the console for:
```
✅ Connected to MongoDB Atlas successfully
🤖 Bot logged in as SARP Core Bot#1234
✅ Successfully reloaded application (/) commands globally.
```

## Available Commands

- `/addstaff @user` - Add a user as bot staff (Admin only)
- `/addstaff @role` - Add a role as bot staff (Admin only)
- `/removestaff @user` - Remove a user from bot staff (Admin only)
- `/removestaff @role` - Remove a role from bot staff (Admin only)
- `/stafflist` - View all bot staff members (Staff only)

## HTTP Server & UptimeRobot Support

The bot includes a built-in HTTP server for health monitoring:
- Main endpoint: `http://localhost:3000/`
- Health check: `http://localhost:3000/health`

Perfect for use with UptimeRobot to keep your bot alive 24/7!

**Deploying to Koyeb?** Check out [DEPLOYMENT.md](./DEPLOYMENT.md) for a complete guide on deploying to Koyeb and setting up UptimeRobot monitoring.

## Support
All commands respond with Discord embeds featuring SARP Core branding.
