# Deployment Guide - Koyeb & UptimeRobot

## 🚀 Deploying to Koyeb

### 1. Prerequisites
- A Koyeb account (free tier available)
- Your Discord bot token
- Your MongoDB connection string

### 2. Deployment Steps

1. **Push your code to GitHub** (if not already done)
   - Create a new repository on GitHub
   - Push your code to the repository

2. **Connect to Koyeb**
   - Go to [Koyeb](https://koyeb.com)
   - Click "Create App"
   - Select "GitHub" as the deployment method
   - Connect your GitHub account and select your repository

3. **Configure Environment Variables**
   In Koyeb, add these environment variables:
   ```
   DISCORD_TOKEN=your_discord_bot_token_here
   MONGODB_URI=your_mongodb_connection_string_here
   PORT=8000
   ```

4. **Configure Build Settings**
   - Build command: `npm install`
   - Run command: `npm start`
   - Port: `8000` (Koyeb typically uses port 8000)

5. **Deploy**
   - Click "Deploy"
   - Wait for the deployment to complete
   - Copy your app's public URL (e.g., `https://your-app-name.koyeb.app`)

---

## 📡 Setting up UptimeRobot

UptimeRobot will ping your bot every 5 minutes to keep it alive and monitor its uptime.

### 1. Create an UptimeRobot Account
- Go to [UptimeRobot](https://uptimerobot.com)
- Sign up for a free account

### 2. Add a New Monitor
1. Click "Add New Monitor"
2. Configure the monitor:
   - **Monitor Type**: HTTP(s)
   - **Friendly Name**: RolePlayManager Discord Bot
   - **URL**: `https://your-app-name.koyeb.app/health`
   - **Monitoring Interval**: 5 minutes (free tier)
   - **Monitor Timeout**: 30 seconds
   - **HTTP Method**: GET

3. Click "Create Monitor"

### 3. Verify It's Working
- UptimeRobot will start pinging your `/health` endpoint every 5 minutes
- You should see "Up" status in your UptimeRobot dashboard
- The health check returns:
  ```json
  {
    "status": "healthy",
    "database": "connected",
    "bot": "online",
    "uptime": 1234.56
  }
  ```

---

## 🔍 Available Endpoints

Your bot now has these HTTP endpoints:

### `GET /`
Main endpoint that returns bot status:
```json
{
  "status": "online",
  "bot": "SΛLINK#9095",
  "uptime": 1234.56,
  "timestamp": "2025-11-21T21:30:00.000Z"
}
```

### `GET /health`
Health check endpoint (recommended for UptimeRobot):
```json
{
  "status": "healthy",
  "database": "connected",
  "bot": "online",
  "uptime": 1234.56
}
```

---

## 🛠️ Troubleshooting

### Bot Not Starting on Koyeb
- Check environment variables are set correctly
- Verify the PORT variable is set to `8000`
- Check Koyeb logs for errors

### UptimeRobot Shows "Down"
- Verify your Koyeb app is running
- Check that the URL is correct
- Test the endpoint manually in your browser
- Ensure port binding is correct (`0.0.0.0:8000` or whatever port Koyeb assigns)

### Database Connection Issues
- Verify MongoDB Atlas allows connections from anywhere (0.0.0.0/0) or add Koyeb IPs
- Check your MONGODB_URI is correct
- Ensure your MongoDB cluster is running

---

## 💡 Tips

1. **Free Tier Limits**: Both Koyeb and UptimeRobot have free tiers that work great for Discord bots
2. **Environment Variables**: Never commit your `.env` file to GitHub
3. **Monitoring**: Set up email alerts in UptimeRobot to get notified if your bot goes down
4. **Logs**: Check Koyeb logs regularly to monitor your bot's health

---

## 📝 Notes

- The HTTP server runs on the port specified by the `PORT` environment variable (default: 3000)
- For Koyeb, set `PORT=8000` in environment variables
- The bot will automatically register all slash commands when it starts
- MongoDB connection is established before the bot logs in
