import { Router } from 'express';
import axios from 'axios';

async function verifyAdminAccess(token, guildId) {
  const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const userGuild = guildsRes.data.find(g => g.id === guildId);
  if (!userGuild) return false;
  return (BigInt(userGuild.permissions) & BigInt(0x8)) === BigInt(0x8);
}

export function createApiRouter(client) {
  const router = Router();

  router.get('/stats', (req, res) => {
    const servers = client.guilds.cache.size;
    const users = client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);
    res.json({ servers, users });
  });

  router.get('/me', async (req, res) => {
    const token = req.cookies?.dash_token;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    try {
      const userRes = await axios.get('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', {
        headers: { Authorization: `Bearer ${token}` },
      });

      const user = userRes.data;
      const userGuilds = guildsRes.data;

      const manageable = userGuilds.filter(g => {
        const perms = BigInt(g.permissions);
        const isAdmin = (perms & BigInt(0x8)) === BigInt(0x8);
        const botInGuild = client.guilds.cache.has(g.id);
        return isAdmin && botInGuild;
      }).map(g => {
        const botGuild = client.guilds.cache.get(g.id);
        return {
          id: g.id,
          name: g.name,
          icon: g.icon,
          memberCount: botGuild?.memberCount || 0,
        };
      });

      res.json({ user: { id: user.id, username: user.username, avatar: user.avatar }, guilds: manageable });
    } catch (err) {
      res.status(401).json({ error: 'Invalid token' });
    }
  });

  router.get('/guild/:id', async (req, res) => {
    const token = req.cookies?.dash_token;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    try {
      const userRes = await axios.get('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${token}` },
      });

      const guild = client.guilds.cache.get(req.params.id);
      if (!guild) return res.status(404).json({ error: 'Guild not found' });

      const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const userGuild = guildsRes.data.find(g => g.id === req.params.id);
      if (!userGuild || !((BigInt(userGuild.permissions) & BigInt(0x8)) === BigInt(0x8))) {
        return res.status(403).json({ error: 'No admin access' });
      }

      let config = {};
      try {
        const { default: Config } = await import('../../models/Config.js');
        const dbConfig = await Config.findOne({ guildId: guild.id });
        if (dbConfig) {
          const logChannel = dbConfig.logChannelId ? guild.channels.cache.get(dbConfig.logChannelId) : null;
          config = {
            logChannelId: dbConfig.logChannelId || null,
            logChannelName: logChannel?.name || null,
            verifyEnabled: !!dbConfig.verifyChannelId,
            strikeEnabled: !!dbConfig.strikeLogChannelId,
            ticketEnabled: !!dbConfig.ticketCategoryId,
            dispatchEnabled: !!dbConfig.dispatchChannelId,
            priorityEnabled: !!dbConfig.priorityChannelId,
            antiPromotingEnabled: !!dbConfig.antiPromotingEnabled,
            welcomeEnabled: !!dbConfig.welcomeChannelId,
            calendarEnabled: !!dbConfig.calendarChannelId,
          };
        }
      } catch (err) {
        console.error('[DASHBOARD] Config fetch error:', err.message);
      }

      let premium = false;
      try {
        const { default: PremiumKey } = await import('../../models/PremiumKey.js');
        const key = await PremiumKey.findOne({ guildId: guild.id, active: true });
        premium = !!key;
      } catch (err) {
        console.error('[DASHBOARD] Premium check error:', err.message);
      }

      res.json({
        id: guild.id,
        name: guild.name,
        icon: guild.iconURL(),
        memberCount: guild.memberCount,
        premium,
        config,
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch guild data' });
    }
  });

  router.get('/guild/:id/module/:mod', async (req, res) => {
    const token = req.cookies?.dash_token;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    try {
      const isAdmin = await verifyAdminAccess(token, req.params.id);
      if (!isAdmin) return res.status(403).json({ error: 'No admin access' });
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const guild = client.guilds.cache.get(req.params.id);
    if (!guild) return res.status(404).json({ error: 'Guild not found' });

    let dbConfig = null;
    try {
      const { default: Config } = await import('../../models/Config.js');
      dbConfig = await Config.findOne({ guildId: guild.id });
    } catch (err) {
      console.error('[DASHBOARD] Failed to fetch config:', err.message);
    }

    const mod = req.params.mod;
    const result = { name: '', description: '', settings: [], stats: [] };

    switch (mod) {
      case 'verification':
        result.name = 'Verification System';
        result.description = 'Member verification with approval workflows';
        if (dbConfig) {
          const ch = dbConfig.verifyChannelId ? guild.channels.cache.get(dbConfig.verifyChannelId) : null;
          const logCh = dbConfig.verifyLogChannelId ? guild.channels.cache.get(dbConfig.verifyLogChannelId) : null;
          result.settings = [
            { label: 'Verify Channel', value: ch ? `#${ch.name}` : 'Not Set' },
            { label: 'Log Channel', value: logCh ? `#${logCh.name}` : 'Not Set' },
            { label: 'Verified Role', value: dbConfig.verifiedRoleId || 'Not Set' },
          ];
        }
        try {
          const { default: Verification } = await import('../../models/Verification.js');
          const pending = await Verification.countDocuments({ guildId: guild.id, status: 'pending' });
          const approved = await Verification.countDocuments({ guildId: guild.id, status: 'approved' });
          result.stats = [
            { label: 'Pending', value: pending },
            { label: 'Approved', value: approved },
          ];
        } catch (err) {
          console.error('[DASHBOARD] Verification stats error:', err.message);
        }
        break;

      case 'strikes':
        result.name = 'Strike System';
        result.description = 'Track and manage member strikes';
        if (dbConfig) {
          result.settings = [
            { label: 'Strike Log', value: dbConfig.strikeLogChannelId ? `Set` : 'Not Set' },
            { label: 'Max Strikes', value: dbConfig.maxStrikes || 'Default' },
          ];
        }
        try {
          const { default: Strike } = await import('../../models/Strike.js');
          const total = await Strike.countDocuments({ guildId: guild.id });
          result.stats = [{ label: 'Total Strike Records', value: total }];
        } catch (err) {
          console.error('[DASHBOARD] Strike stats error:', err.message);
        }
        break;

      case 'tickets':
        result.name = 'Ticket Support';
        result.description = 'Support ticket management';
        if (dbConfig) {
          result.settings = [
            { label: 'Ticket Category', value: dbConfig.ticketCategoryId ? 'Set' : 'Not Set' },
          ];
        }
        try {
          const { default: Ticket } = await import('../../models/Ticket.js');
          const open = await Ticket.countDocuments({ guildId: guild.id, status: 'open' });
          const closed = await Ticket.countDocuments({ guildId: guild.id, status: 'closed' });
          result.stats = [
            { label: 'Open Tickets', value: open },
            { label: 'Closed Tickets', value: closed },
          ];
        } catch (err) {
          console.error('[DASHBOARD] Ticket stats error:', err.message);
        }
        break;

      case 'dispatch':
        result.name = 'AI Voice Dispatch';
        result.description = 'AI-powered voice dispatch system (Premium)';
        if (dbConfig) {
          const ch = dbConfig.dispatchChannelId ? guild.channels.cache.get(dbConfig.dispatchChannelId) : null;
          result.settings = [
            { label: 'Dispatch Channel', value: ch ? `#${ch.name}` : 'Not Set' },
            { label: 'Voice Channel', value: dbConfig.dispatchVoiceChannelId ? 'Set' : 'Not Set' },
          ];
        }
        break;

      case 'priority':
        result.name = 'Priority Tracker';
        result.description = 'Real-time priority event tracking';
        if (dbConfig) {
          const ch = dbConfig.priorityChannelId ? guild.channels.cache.get(dbConfig.priorityChannelId) : null;
          result.settings = [
            { label: 'Priority Channel', value: ch ? `#${ch.name}` : 'Not Set' },
            { label: 'Cooldown', value: dbConfig.priorityCooldown ? `${dbConfig.priorityCooldown} min` : 'Default' },
          ];
        }
        break;

      case 'antipromo':
        result.name = 'Anti-Promoting';
        result.description = 'Automatic invite link detection and removal';
        if (dbConfig) {
          result.settings = [
            { label: 'Enabled', value: dbConfig.antiPromotingEnabled ? 'Yes' : 'No' },
          ];
          if (dbConfig.whitelistedInvites?.length) {
            result.settings.push({ label: 'Whitelisted Links', value: dbConfig.whitelistedInvites.length });
          }
        }
        break;

      default:
        return res.status(404).json({ error: 'Module not found' });
    }

    res.json(result);
  });

  return router;
}
