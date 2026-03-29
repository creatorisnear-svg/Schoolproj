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
      const isAdmin = await verifyAdminAccess(token, req.params.id);
      if (!isAdmin) return res.status(403).json({ error: 'No admin access' });

      const guild = client.guilds.cache.get(req.params.id);
      if (!guild) return res.status(404).json({ error: 'Guild not found' });

      let config = {};
      try {
        const { default: Config } = await import('../../models/Config.js');
        const dbConfig = await Config.findOne({ guildId: guild.id });
        if (dbConfig) {
          const logChannel = dbConfig.logChannelId ? guild.channels.cache.get(dbConfig.logChannelId) : null;
          config = {
            logChannelId: dbConfig.logChannelId || null,
            logChannelName: logChannel?.name || null,
            verifyEnabled: false,
            strikeEnabled: !!dbConfig.logChannelId,
            ticketEnabled: false,
            dispatchEnabled: false,
            priorityEnabled: false,
            antiPromotingEnabled: !!dbConfig.antiPromotingEnabled,
            welcomeEnabled: false,
            calendarEnabled: false,
          };
        }
      } catch (err) {
        console.error('[DASHBOARD] Config fetch error:', err.message);
      }

      try {
        const { default: TicketConfig } = await import('../../models/TicketConfig.js');
        const tc = await TicketConfig.findOne({ guildId: guild.id });
        if (tc) config.ticketEnabled = !!tc.enabled;
      } catch {}

      try {
        const { default: Welcome } = await import('../../models/Welcome.js');
        const wc = await Welcome.findOne({ guildId: guild.id });
        if (wc) config.welcomeEnabled = !!wc.enabled;
      } catch {}

      try {
        const { default: DispatchConfig } = await import('../../models/DispatchConfig.js');
        const dc = await DispatchConfig.findOne({ guildId: guild.id });
        if (dc) config.dispatchEnabled = !!dc.enabled;
      } catch {}

      try {
        const { default: Priority } = await import('../../models/Priority.js');
        const pc = await Priority.findOne({ guildId: guild.id });
        if (pc) config.priorityEnabled = !!pc.enabled;
      } catch {}

      try {
        const { default: RoleplayCalendar } = await import('../../models/RoleplayCalendar.js');
        const rc = await RoleplayCalendar.findOne({ guildId: guild.id });
        if (rc) config.calendarEnabled = !!rc.channelId;
      } catch {}

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

  function getTextChannels(guild) {
    return guild.channels.cache
      .filter(c => c.type === 0)
      .sort((a, b) => a.position - b.position)
      .map(c => ({ value: c.id, label: '#' + c.name }));
  }

  function getCategoryChannels(guild) {
    return guild.channels.cache
      .filter(c => c.type === 4)
      .sort((a, b) => a.position - b.position)
      .map(c => ({ value: c.id, label: c.name }));
  }

  function getVoiceChannels(guild) {
    return guild.channels.cache
      .filter(c => c.type === 2)
      .sort((a, b) => a.position - b.position)
      .map(c => ({ value: c.id, label: c.name }));
  }

  function getRoles(guild) {
    return guild.roles.cache
      .filter(r => r.id !== guild.id && !r.managed)
      .sort((a, b) => b.position - a.position)
      .map(r => ({ value: r.id, label: '@' + r.name }));
  }

  router.get('/guild/:id/settings/:mod', async (req, res) => {
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

    const mod = req.params.mod;
    const result = { name: '', description: '', fields: [], stats: [] };
    const channels = getTextChannels(guild);
    const categories = getCategoryChannels(guild);
    const voiceChannels = getVoiceChannels(guild);
    const roles = getRoles(guild);

    try {
      switch (mod) {
        case 'general': {
          result.name = 'General Settings';
          result.description = 'Core server configuration';
          const { default: Config } = await import('../../models/Config.js');
          const config = await Config.findOne({ guildId: guild.id });
          result.fields = [
            { key: 'logChannelId', label: 'Log Channel', description: 'Channel for bot action logs', type: 'select', value: config?.logChannelId || '', options: channels },
            { key: 'staffCanBypassLinks', label: 'Staff Bypass Links', description: 'Allow staff to post invite links', type: 'toggle', value: config?.staffCanBypassLinks ?? true },
          ];
          break;
        }

        case 'verification': {
          result.name = 'Verification System';
          result.description = 'Member verification with approval workflows';
          const { default: PendingVerification } = await import('../../models/PendingVerification.js');
          const { default: Config } = await import('../../models/Config.js');
          const config = await Config.findOne({ guildId: guild.id });
          result.fields = [
            { key: 'verifyChannelId', label: 'Verify Channel', description: 'Channel where verification panel is posted', type: 'select', value: config?.reportChannelId || '', options: channels },
          ];
          try {
            const { default: Verification } = await import('../../models/Verification.js');
            const pending = await Verification.countDocuments({ guildId: guild.id, status: 'pending' });
            const approved = await Verification.countDocuments({ guildId: guild.id, status: 'approved' });
            result.stats = [
              { label: 'Pending', value: pending },
              { label: 'Approved', value: approved },
            ];
          } catch {}
          break;
        }

        case 'strikes': {
          result.name = 'Strike System';
          result.description = 'Track and manage member strikes';
          result.fields = [];
          try {
            const { default: Strike } = await import('../../models/Strike.js');
            const total = await Strike.countDocuments({ guildId: guild.id });
            result.stats = [{ label: 'Total Strike Records', value: total }];
          } catch {}
          break;
        }

        case 'tickets': {
          result.name = 'Ticket Support';
          result.description = 'Support ticket management system';
          const { default: TicketConfig } = await import('../../models/TicketConfig.js');
          const tc = await TicketConfig.findOne({ guildId: guild.id });
          result.fields = [
            { key: 'enabled', label: 'Enabled', description: 'Enable or disable the ticket system', type: 'toggle', value: tc?.enabled ?? false },
            { key: 'panelChannelId', label: 'Panel Channel', description: 'Channel where the ticket panel is posted', type: 'select', value: tc?.panelChannelId || '', options: channels },
            { key: 'panelTitle', label: 'Panel Title', description: 'Title text for the ticket embed', type: 'text', value: tc?.panelTitle || '', placeholder: 'Support Tickets' },
            { key: 'panelDescription', label: 'Panel Description', description: 'Description text for the ticket embed', type: 'text', value: tc?.panelDescription || '', placeholder: 'Click below to open a ticket' },
          ];
          try {
            const { default: Ticket } = await import('../../models/Ticket.js');
            const open = await Ticket.countDocuments({ guildId: guild.id, status: 'open' });
            const closed = await Ticket.countDocuments({ guildId: guild.id, status: 'closed' });
            result.stats = [
              { label: 'Open Tickets', value: open },
              { label: 'Closed Tickets', value: closed },
            ];
          } catch {}
          break;
        }

        case 'dispatch': {
          result.name = 'AI Voice Dispatch';
          result.description = 'AI-powered voice dispatch system (Premium)';
          const { default: DispatchConfig } = await import('../../models/DispatchConfig.js');
          const dc = await DispatchConfig.findOne({ guildId: guild.id });
          result.fields = [
            { key: 'enabled', label: 'Enabled', description: 'Enable or disable dispatch', type: 'toggle', value: dc?.enabled ?? false },
            { key: 'aiEnabled', label: 'AI Responses', description: 'Generate AI dispatcher responses', type: 'toggle', value: dc?.aiEnabled ?? false },
            { key: 'dispatchChannelId', label: 'Dispatch Channel', description: 'Channel for dispatch logs', type: 'select', value: dc?.dispatchChannelId || '', options: channels },
            { key: 'statusBoardChannelId', label: 'Status Board Channel', description: 'Channel for the officer status board', type: 'select', value: dc?.statusBoardChannelId || '', options: channels },
          ];
          break;
        }

        case 'priority': {
          result.name = 'Priority Tracker';
          result.description = 'Real-time priority event tracking';
          const { default: Priority } = await import('../../models/Priority.js');
          const pc = await Priority.findOne({ guildId: guild.id });
          result.fields = [
            { key: 'enabled', label: 'Enabled', description: 'Enable or disable the priority tracker', type: 'toggle', value: pc?.enabled ?? false },
            { key: 'channelId', label: 'Priority Channel', description: 'Channel for priority announcements', type: 'select', value: pc?.channelId || '', options: channels },
            { key: 'cooldownMinutes', label: 'Cooldown (minutes)', description: 'Cooldown between priorities', type: 'number', value: pc?.cooldownMinutes || 10, min: 1, max: 120 },
          ];
          break;
        }

        case 'antipromo': {
          result.name = 'Anti-Promoting';
          result.description = 'Automatic invite link detection and removal';
          const { default: Config } = await import('../../models/Config.js');
          const config = await Config.findOne({ guildId: guild.id });
          result.fields = [
            { key: 'antiPromotingEnabled', label: 'Enabled', description: 'Detect and remove Discord invite links', type: 'toggle', value: config?.antiPromotingEnabled ?? false },
            { key: 'antiPromotingLogChannelId', label: 'Log Channel', description: 'Channel to log deleted invite links', type: 'select', value: config?.antiPromotingLogChannelId || '', options: channels },
            { key: 'staffCanBypassLinks', label: 'Staff Bypass', description: 'Allow staff to post invite links', type: 'toggle', value: config?.staffCanBypassLinks ?? true },
          ];
          break;
        }

        case 'welcome': {
          result.name = 'Welcome System';
          result.description = 'Welcome messages for new members';
          const { default: Welcome } = await import('../../models/Welcome.js');
          const wc = await Welcome.findOne({ guildId: guild.id });
          result.fields = [
            { key: 'enabled', label: 'Enabled', description: 'Enable or disable welcome messages', type: 'toggle', value: wc?.enabled ?? false },
            { key: 'channelId', label: 'Welcome Channel', description: 'Channel for welcome messages', type: 'select', value: wc?.channelId || '', options: channels },
            { key: 'welcomeMessage', label: 'Channel Message', description: 'Use {user} for mention, {server} for server name', type: 'text', value: wc?.welcomeMessage || '', placeholder: 'Welcome {user} to {server}!' },
            { key: 'welcomeDM', label: 'DM Message', description: 'Sent to the new member via DM', type: 'text', value: wc?.welcomeDM || '', placeholder: 'Welcome to {server}!' },
          ];
          break;
        }

        default:
          return res.status(404).json({ error: 'Module not found' });
      }
    } catch (err) {
      console.error(`[DASHBOARD] Settings fetch error (${mod}):`, err.message);
    }

    res.json(result);
  });

  router.post('/guild/:id/settings/:mod', async (req, res) => {
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

    const mod = req.params.mod;
    const changes = req.body;

    if (!changes || Object.keys(changes).length === 0) {
      return res.status(400).json({ error: 'No changes provided' });
    }

    try {
      switch (mod) {
        case 'general':
        case 'antipromo': {
          const { default: Config } = await import('../../models/Config.js');
          const allowed = ['logChannelId', 'antiPromotingEnabled', 'antiPromotingLogChannelId', 'staffCanBypassLinks'];
          const update = {};
          for (const [k, v] of Object.entries(changes)) {
            if (allowed.includes(k)) update[k] = v;
          }
          await Config.findOneAndUpdate({ guildId: guild.id }, update, { upsert: true });
          break;
        }

        case 'tickets': {
          const { default: TicketConfig } = await import('../../models/TicketConfig.js');
          const allowed = ['enabled', 'panelChannelId', 'panelTitle', 'panelDescription'];
          const update = {};
          for (const [k, v] of Object.entries(changes)) {
            if (allowed.includes(k)) update[k] = v;
          }
          await TicketConfig.findOneAndUpdate({ guildId: guild.id }, update, { upsert: true });
          break;
        }

        case 'dispatch': {
          const { default: DispatchConfig } = await import('../../models/DispatchConfig.js');
          const allowed = ['enabled', 'aiEnabled', 'dispatchChannelId', 'statusBoardChannelId'];
          const update = {};
          for (const [k, v] of Object.entries(changes)) {
            if (allowed.includes(k)) update[k] = v;
          }
          await DispatchConfig.findOneAndUpdate({ guildId: guild.id }, update, { upsert: true });
          break;
        }

        case 'priority': {
          const { default: Priority } = await import('../../models/Priority.js');
          const allowed = ['enabled', 'channelId', 'cooldownMinutes'];
          const update = {};
          for (const [k, v] of Object.entries(changes)) {
            if (allowed.includes(k)) {
              if (k === 'cooldownMinutes') update[k] = Math.max(1, Math.min(120, parseInt(v) || 10));
              else update[k] = v;
            }
          }
          await Priority.findOneAndUpdate({ guildId: guild.id }, update, { upsert: true });
          break;
        }

        case 'welcome': {
          const { default: Welcome } = await import('../../models/Welcome.js');
          const allowed = ['enabled', 'channelId', 'welcomeMessage', 'welcomeDM'];
          const update = {};
          for (const [k, v] of Object.entries(changes)) {
            if (allowed.includes(k)) update[k] = v;
          }
          await Welcome.findOneAndUpdate({ guildId: guild.id }, update, { upsert: true });
          break;
        }

        case 'verification':
        case 'strikes':
          break;

        default:
          return res.status(404).json({ error: 'Module not found' });
      }

      res.json({ success: true });
    } catch (err) {
      console.error(`[DASHBOARD] Settings save error (${mod}):`, err.message);
      res.status(500).json({ error: 'Failed to save settings' });
    }
  });

  return router;
}
