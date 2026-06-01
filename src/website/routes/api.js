import { Router } from 'express';
import { REST, Routes } from 'discord.js';
import axios from 'axios';
import Announcement from '../../models/Announcement.js';
import Changelog from '../../models/Changelog.js';
import PreviewVideo from '../../models/PreviewVideo.js';
import FeatureFlag from '../../models/FeatureFlag.js';
import { checkFeatureAccess, isFeaturePremiumGated } from '../../utils/premiumCheck.js';

const DEFAULT_PREMIUM_FEATURES = ['dispatch'];

async function verifyAdminAccess(token, guildId) {
  const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const userGuild = guildsRes.data.find(g => g.id === guildId);
  if (!userGuild) return false;
  return (BigInt(userGuild.permissions) & BigInt(0x8)) === BigInt(0x8);
}

function getToken(req) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  return req.cookies?.dash_token || null;
}

export function createApiRouter(client) {
  const router = Router();

  router.get('/admin/clear-global-commands', async (req, res) => {
    const secret = req.query.secret;
    const adminSecret = process.env.ADMIN_SECRET;
    const token = process.env.DISCORD_TOKEN;

    if (!adminSecret) {
      return res.status(500).json({ error: 'ADMIN_SECRET environment variable is not set on the server.' });
    }
    if (!secret || secret !== adminSecret) {
      return res.status(403).json({ error: 'Forbidden - wrong or missing secret.' });
    }
    if (!token) {
      return res.status(500).json({ error: 'DISCORD_TOKEN environment variable is not set on the server.' });
    }

    const appId = process.env.CLIENT_ID || client.user?.id || '1441306995641683978';
    try {
      const rest = new REST({ version: '10' }).setToken(token);
      const before = await rest.get(Routes.applicationCommands(appId));
      await rest.put(Routes.applicationCommands(appId), { body: [] });
      res.json({
        success: true,
        cleared: before.length,
        message: `Cleared ${before.length} global command(s) for app ${appId}. Discord may take up to 1 hour to reflect this globally.`,
      });
    } catch (err) {
      res.status(500).json({ error: err.message, stack: err.stack?.split('\n').slice(0, 3) });
    }
  });

  router.get('/stats', (req, res) => {
    const servers = client.guilds.cache.size;
    const users = client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);
    res.json({ servers, users });
  });

  router.get('/bot-status', (req, res) => {
    const online = client.isReady();
    res.json({
      online,
      ping: online ? client.ws.ping : -1,
      guilds: online ? client.guilds.cache.size : 0,
    });
  });

  router.get('/public/announcements', async (req, res) => {
    try {
      const items = await Announcement.find({ active: true }).sort({ createdAt: -1 }).limit(5);
      res.json(items);
    } catch { res.json([]); }
  });

  router.get('/public/changelogs', async (req, res) => {
    try {
      const items = await Changelog.find().sort({ date: -1 }).limit(5);
      res.json(items);
    } catch { res.json([]); }
  });

  router.get('/public/videos', async (req, res) => {
    try {
      const items = await PreviewVideo.find().select('-videoData').sort({ order: 1, createdAt: -1 });
      res.json(items);
    } catch { res.json([]); }
  });

  router.get('/public/videos/:id/file', async (req, res) => {
    try {
      const item = await PreviewVideo.findById(req.params.id).select('videoData mimeType');
      if (!item || !item.videoData) return res.status(404).send('Not found');
      res.setHeader('Content-Type', item.mimeType || 'video/mp4');
      res.setHeader('Cache-Control', 'public, max-age=604800');
      res.setHeader('Accept-Ranges', 'bytes');
      res.send(item.videoData);
    } catch { res.status(500).send('Error'); }
  });

  router.get('/public/features', async (req, res) => {
    try {
      const flags = await FeatureFlag.find();
      const flagMap = {};
      flags.forEach(f => { flagMap[f.feature] = f.premium; });
      res.json(flagMap);
    } catch {
      const fallback = {};
      DEFAULT_PREMIUM_FEATURES.forEach(f => { fallback[f] = true; });
      res.json(fallback);
    }
  });

  router.get('/me', async (req, res) => {
    const token = getToken(req);
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

  router.get('/guild/:id', async (req, res) => {
    const token = getToken(req);
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    try {
      const isAdmin = await verifyAdminAccess(token, req.params.id);
      if (!isAdmin) return res.status(403).json({ error: 'No admin access' });

      const guild = client.guilds.cache.get(req.params.id);
      if (!guild) return res.status(404).json({ error: 'Guild not found' });

      let config = {
        logChannelId: null,
        logChannelName: null,
        verifyEnabled: false,
        strikeEnabled: false,
        ticketEnabled: false,
        dispatchEnabled: false,
        priorityEnabled: false,
        antiPromotingEnabled: false,
        welcomeEnabled: false,
        calendarEnabled: false,
        roleplayEnabled: false,
        roleRequestEnabled: false,
      };

      try {
        const { default: Config } = await import('../../models/Config.js');
        const dbConfig = await Config.findOne({ guildId: guild.id });
        if (dbConfig) {
          const logChannel = dbConfig.logChannelId ? guild.channels.cache.get(dbConfig.logChannelId) : null;
          config.logChannelId = dbConfig.logChannelId || null;
          config.logChannelName = logChannel?.name || null;
          config.antiPromotingEnabled = !!dbConfig.antiPromotingEnabled;
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
        if (rc) config.calendarEnabled = !!rc.enabled;
      } catch {}

      try {
        const { default: RoleplayCommands } = await import('../../models/RoleplayCommands.js');
        const rpc = await RoleplayCommands.findOne({ guildId: guild.id });
        if (rpc) config.roleplayEnabled = !!rpc.enabled;
      } catch {}

      try {
        const { default: Verification } = await import('../../models/Verification.js');
        const vc = await Verification.findOne({ guildId: guild.id });
        if (vc) config.verifyEnabled = !!vc.enabled;
      } catch {}

      try {
        const { StrikeConfig } = await import('../../models/Strike.js');
        const sc = await StrikeConfig.findOne({ guildId: guild.id });
        if (sc) config.strikeEnabled = !!sc.enabled;
      } catch {}

      try {
        const { default: RoleRequestConfig } = await import('../../models/RoleRequestConfig.js');
        const rrc = await RoleRequestConfig.findOne({ guildId: guild.id });
        if (rrc) config.roleRequestEnabled = !!rrc.enabled;
      } catch {}

      try {
        const { default: EconomyConfig } = await import('../../models/EconomyConfig.js');
        const ec = await EconomyConfig.findOne({ guildId: guild.id });
        if (ec) config.economyEnabled = !!ec.enabled;
      } catch {}

      let premium = false;
      let premiumDetails = null;
      try {
        const { default: PremiumKey } = await import('../../models/PremiumKey.js');
        const key = await PremiumKey.findOne({ guildId: guild.id });
        premium = !!key;
        if (key) {
          premiumDetails = {
            plan: key.plan || 'manual',
            subscriptionStatus: key.subscriptionStatus || null,
            subscriptionCurrentPeriodEnd: key.subscriptionCurrentPeriodEnd || null,
            hasStripeSubscription: !!key.stripeSubscriptionId,
            activatedAt: key.activatedAt || null,
          };
        }
      } catch (err) {
        console.error('[DASHBOARD] Premium check error:', err.message);
      }

      res.json({
        id: guild.id,
        name: guild.name,
        icon: guild.iconURL(),
        memberCount: guild.memberCount,
        premium,
        premiumDetails,
        config,
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch guild data' });
    }
  });

  router.post('/guild/:id/feature/:feature', async (req, res) => {
    const token = getToken(req);
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    try {
      const isAdmin = await verifyAdminAccess(token, req.params.id);
      if (!isAdmin) return res.status(403).json({ error: 'No admin access' });
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const guildId = req.params.id;
    const feature = req.params.feature;
    const { enabled } = req.body;

    if (!client.guilds.cache.has(guildId)) {
      return res.status(404).json({ error: 'Guild not found' });
    }

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be a boolean' });
    }

    if (enabled) {
      const access = await checkFeatureAccess(guildId, feature);
      if (!access.allowed) {
        return res.status(403).json({ error: 'premium_required', message: 'This feature requires a premium key. Use `/activatepremium` in Discord or enter your key in the Premium section of the dashboard.' });
      }
    }

    try {
      switch (feature) {
        case 'roleplay': {
          const { default: RoleplayCommands } = await import('../../models/RoleplayCommands.js');
          await RoleplayCommands.findOneAndUpdate({ guildId }, { enabled }, { upsert: true });
          break;
        }
        case 'priority': {
          const { default: Priority } = await import('../../models/Priority.js');
          await Priority.findOneAndUpdate({ guildId }, { enabled }, { upsert: true });
          break;
        }
        case 'strike': {
          const { StrikeConfig } = await import('../../models/Strike.js');
          await StrikeConfig.findOneAndUpdate({ guildId }, { enabled }, { upsert: true });
          break;
        }
        case 'calendar': {
          const { default: RoleplayCalendar } = await import('../../models/RoleplayCalendar.js');
          await RoleplayCalendar.findOneAndUpdate({ guildId }, { enabled }, { upsert: true });
          break;
        }
        case 'ticket': {
          const { default: TicketConfig } = await import('../../models/TicketConfig.js');
          await TicketConfig.findOneAndUpdate({ guildId }, { enabled }, { upsert: true });
          break;
        }
        case 'antipromote': {
          const { default: Config } = await import('../../models/Config.js');
          await Config.findOneAndUpdate({ guildId }, { antiPromotingEnabled: enabled }, { upsert: true });
          break;
        }
        case 'rolerequest': {
          const { default: RoleRequestConfig } = await import('../../models/RoleRequestConfig.js');
          await RoleRequestConfig.findOneAndUpdate({ guildId }, { enabled }, { upsert: true });
          break;
        }
        case 'verification': {
          const { default: Verification } = await import('../../models/Verification.js');
          await Verification.findOneAndUpdate({ guildId }, { enabled }, { upsert: true });
          break;
        }
        case 'welcome': {
          const { default: Welcome } = await import('../../models/Welcome.js');
          await Welcome.findOneAndUpdate({ guildId }, { enabled }, { upsert: true });
          break;
        }
        case 'dispatch': {
          const { default: DispatchConfig } = await import('../../models/DispatchConfig.js');
          await DispatchConfig.findOneAndUpdate({ guildId }, { enabled }, { upsert: true });
          break;
        }
        case 'economy': {
          const { default: EconomyConfig } = await import('../../models/EconomyConfig.js');
          await EconomyConfig.findOneAndUpdate({ guildId }, { enabled }, { upsert: true });
          break;
        }
        default:
          return res.status(404).json({ error: 'Unknown feature' });
      }

      res.json({ success: true });
    } catch (err) {
      console.error(`[DASHBOARD] Feature toggle error (${feature}):`, err.message);
      res.status(500).json({ error: 'Failed to toggle feature' });
    }
  });

  router.get('/guild/:id/settings/:mod', async (req, res) => {
    const token = getToken(req);
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
          result.description = 'Core bot configuration for this server';
          const { default: Config } = await import('../../models/Config.js');
          const config = await Config.findOne({ guildId: guild.id });
          result.fields = [
            { key: 'logChannelId', label: 'Log Channel', description: 'Channel where bot actions are logged', type: 'select', value: config?.logChannelId || '', options: channels },
          ];
          break;
        }

        case 'verification': {
          result.name = 'Verification System';
          result.description = 'Gate new members with verification questions and approval';
          const { default: Verification } = await import('../../models/Verification.js');
          const vc = await Verification.findOne({ guildId: guild.id });
          result.fields = [
            { key: 'verifyChannelId', label: 'Verification Channel', description: 'Channel where the verify button is posted', type: 'select', value: vc?.verifyChannelId || '', options: channels },
            { key: 'approvalChannelId', label: 'Approval Channel', description: 'Channel where staff approve/deny applications', type: 'select', value: vc?.approvalChannelId || '', options: channels },
            { key: 'verifiedRoleId', label: 'Verified Role', description: 'Role given to verified members', type: 'role', value: vc?.verifiedRoleId || '', options: roles },
            { key: 'unverifiedRoleId', label: 'Unverified Role', description: 'Role assigned to new unverified members', type: 'role', value: vc?.unverifiedRoleId || '', options: roles },
            { key: 'approvalRequired', label: 'Require Staff Approval', description: 'Staff must approve each verification before the role is given', type: 'toggle', value: vc?.approvalRequired ?? false },
            { key: 'rpTag', label: 'RP Tag', description: 'Ask for PSN/Xbox/PC tag during verification', type: 'text', value: vc?.rpTag || '', placeholder: 'e.g. PSN, Xbox, PC' },
            { key: 'verifyDMMessage', label: 'Approval DM Message', description: 'Sent to the member when they are approved. Use {server} for server name', type: 'textarea', value: vc?.verifyDMMessage || '', placeholder: 'Welcome to {server}! You have been verified.' },
          ];
          try {
            const { default: PendingVerification } = await import('../../models/PendingVerification.js');
            const pending = await PendingVerification.countDocuments({ guildId: guild.id, status: 'pending' });
            result.stats = [
              { label: 'Pending Applications', value: pending },
            ];
          } catch {}
          break;
        }

        case 'strikes': {
          result.name = 'Strike System';
          result.description = 'Automated strike levels with configurable punishments';
          const { StrikeConfig } = await import('../../models/Strike.js');
          const sc = await StrikeConfig.findOne({ guildId: guild.id });
          result.fields = [
            { key: 'strike1_roleId', label: 'Strike 1 Role', description: 'Role assigned at strike level 1', type: 'role', value: sc?.strikes?.strike1?.roleId || '', options: roles },
            { key: 'strike1_action', label: 'Strike 1 Action', description: 'Action taken at strike level 1', type: 'action', value: sc?.strikes?.strike1?.action || 'none', options: [
              { value: 'none', label: 'No action' }, { value: 'timeout', label: 'Timeout' }, { value: 'kick', label: 'Kick' }, { value: 'ban', label: 'Ban' }
            ]},
            { key: 'strike2_roleId', label: 'Strike 2 Role', description: 'Role assigned at strike level 2', type: 'role', value: sc?.strikes?.strike2?.roleId || '', options: roles },
            { key: 'strike2_action', label: 'Strike 2 Action', description: 'Action taken at strike level 2', type: 'action', value: sc?.strikes?.strike2?.action || 'none', options: [
              { value: 'none', label: 'No action' }, { value: 'timeout', label: 'Timeout' }, { value: 'kick', label: 'Kick' }, { value: 'ban', label: 'Ban' }
            ]},
            { key: 'strike3_roleId', label: 'Strike 3 Role', description: 'Role assigned at strike level 3', type: 'role', value: sc?.strikes?.strike3?.roleId || '', options: roles },
            { key: 'strike3_action', label: 'Strike 3 Action', description: 'Action taken at strike level 3', type: 'action', value: sc?.strikes?.strike3?.action || 'none', options: [
              { value: 'none', label: 'No action' }, { value: 'timeout', label: 'Timeout' }, { value: 'kick', label: 'Kick' }, { value: 'ban', label: 'Ban' }
            ]},
            { key: 'strike4_roleId', label: 'Strike 4 Role', description: 'Role assigned at strike level 4', type: 'role', value: sc?.strikes?.strike4?.roleId || '', options: roles },
            { key: 'strike4_action', label: 'Strike 4 Action', description: 'Action taken at strike level 4', type: 'action', value: sc?.strikes?.strike4?.action || 'none', options: [
              { value: 'none', label: 'No action' }, { value: 'timeout', label: 'Timeout' }, { value: 'kick', label: 'Kick' }, { value: 'ban', label: 'Ban' }
            ]},
          ];
          break;
        }

        case 'tickets': {
          result.name = 'Ticket Support';
          result.description = 'Support ticket system with categories and staff roles';
          const { default: TicketConfig } = await import('../../models/TicketConfig.js');
          const tc = await TicketConfig.findOne({ guildId: guild.id });
          result.fields = [
            { key: 'panelChannelId', label: 'Panel Channel', description: 'Channel where the ticket panel embed is posted', type: 'select', value: tc?.panelChannelId || '', options: channels },
            { key: 'panelTitle', label: 'Panel Title', description: 'Title shown on the ticket panel embed', type: 'text', value: tc?.panelTitle || '', placeholder: 'Support Tickets' },
            { key: 'panelDescription', label: 'Panel Description', description: 'Description shown on the ticket panel embed', type: 'textarea', value: tc?.panelDescription || '', placeholder: 'Click a button below to open a ticket' },
          ];
          result.ticketTypes = (tc?.ticketTypes || []).map(t => ({
            id: t.id || t._id?.toString(),
            label: t.label,
            allowedRoleIds: t.allowedRoleIds || [],
            buttonColor: t.buttonColor || 'Primary',
          }));
          result.roles = roles;
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
          result.description = 'AI-powered voice dispatch for law enforcement roleplay';
          result.premium = await isFeaturePremiumGated('dispatch');
          const { default: DispatchConfig } = await import('../../models/DispatchConfig.js');
          const dc = await DispatchConfig.findOne({ guildId: guild.id });
          result.fields = [
            { key: 'aiEnabled', label: 'AI Responses', description: 'Generate AI dispatcher responses from officer voice input', type: 'toggle', value: dc?.aiEnabled ?? false },
            { key: 'dispatchChannelId', label: 'Dispatch Channel', description: 'Text channel for dispatch logs and AI responses', type: 'select', value: dc?.dispatchChannelId || '', options: channels },
            { key: 'statusBoardChannelId', label: 'Status Board Channel', description: 'Channel for the live officer status board embed', type: 'select', value: dc?.statusBoardChannelId || '', options: channels },
          ];
          result.voiceChannels = voiceChannels;
          result.currentPatrolChannels = dc?.patrolChannelIds || [];
          result.currentTrafficChannels = dc?.trafficStopChannelIds || [];
          result.leoRoles = dc?.leoRoleIds || [];
          result.roles = roles;
          break;
        }

        case 'priority': {
          result.name = 'Priority Tracker';
          result.description = 'Real-time priority event tracking with cooldowns';
          const { default: Priority } = await import('../../models/Priority.js');
          const pc = await Priority.findOne({ guildId: guild.id });
          result.fields = [
            { key: 'channelId', label: 'Priority Channel', description: 'Channel where priority status embeds are posted', type: 'select', value: pc?.channelId || '', options: channels },
            { key: 'cooldownMinutes', label: 'Cooldown (minutes)', description: 'Minimum time between priority activations', type: 'number', value: pc?.cooldownMinutes || 10, min: 1, max: 120 },
          ];
          result.stats = [
            { label: 'Status', value: pc?.priorityActive ? 'ACTIVE' : 'Inactive' },
          ];
          break;
        }

        case 'antipromo': {
          result.name = 'Anti-Promoting';
          result.description = 'Automatically detect and remove Discord invite links';
          const { default: Config } = await import('../../models/Config.js');
          const config = await Config.findOne({ guildId: guild.id });
          result.fields = [
            { key: 'antiPromotingLogChannelId', label: 'Log Channel', description: 'Channel where deleted invite link logs are sent', type: 'select', value: config?.antiPromotingLogChannelId || '', options: channels },
            { key: 'staffCanBypassLinks', label: 'Staff Bypass', description: 'Allow staff members to post invite links', type: 'toggle', value: config?.staffCanBypassLinks ?? true },
          ];
          result.whitelistedLinks = config?.whitelistedInviteLinks || [];
          break;
        }

        case 'welcome': {
          result.name = 'Welcome System';
          result.description = 'Send welcome messages when new members join';
          const { default: Welcome } = await import('../../models/Welcome.js');
          const wc = await Welcome.findOne({ guildId: guild.id });
          result.fields = [
            { key: 'channelId', label: 'Welcome Channel', description: 'Channel where welcome messages are sent', type: 'select', value: wc?.channelId || '', options: channels },
            { key: 'welcomeMessage', label: 'Channel Message', description: 'Use {user} for mention, {server} for server name', type: 'textarea', value: wc?.welcomeMessage || '', placeholder: 'Welcome {user} to {server}!' },
            { key: 'welcomeDM', label: 'DM Message', description: 'Private message sent to the new member on join', type: 'textarea', value: wc?.welcomeDM || '', placeholder: 'Welcome to {server}!' },
          ];
          break;
        }

        case 'roleplay': {
          result.name = 'Roleplay Commands';
          result.description = 'Configure channels for 911 calls, Twitter, anonymous tips, and CAD';
          const { default: RoleplayCommands } = await import('../../models/RoleplayCommands.js');
          const rpc = await RoleplayCommands.findOne({ guildId: guild.id });
          result.fields = [
            { key: 'use911', label: 'Enable 911 Command', description: 'Allow civilians to make emergency calls', type: 'toggle', value: rpc?.use911 ?? false },
            { key: 'use911Channel', label: '911 Channel', description: 'Channel where 911 calls are posted', type: 'select', value: rpc?.use911Channel || '', options: channels },
            { key: 'useTwitter', label: 'Enable Twitter Command', description: 'Allow in-character Twitter posts', type: 'toggle', value: rpc?.useTwitter ?? false },
            { key: 'twitterChannel', label: 'Twitter Channel', description: 'Channel where Twitter posts appear', type: 'select', value: rpc?.twitterChannel || '', options: channels },
            { key: 'useAnon', label: 'Enable Anonymous Tips', description: 'Allow anonymous tip submissions', type: 'toggle', value: rpc?.useAnon ?? false },
            { key: 'anonChannel', label: 'Anonymous Channel', description: 'Channel where anonymous tips are posted', type: 'select', value: rpc?.anonChannel || '', options: channels },
            { key: 'useCAD', label: 'Enable CAD System', description: 'Enable the CAD database commands', type: 'toggle', value: rpc?.useCAD ?? false },
            { key: 'cadChannel', label: 'CAD Channel', description: 'Channel for CAD lookups and responses', type: 'select', value: rpc?.cadChannel || '', options: channels },
          ];
          break;
        }

        case 'calendar': {
          result.name = 'Roleplay Calendar';
          result.description = 'Schedule and display weekly roleplay events';
          const { default: RoleplayCalendar } = await import('../../models/RoleplayCalendar.js');
          const rc = await RoleplayCalendar.findOne({ guildId: guild.id });
          result.fields = [
            { key: 'channelId', label: 'Calendar Channel', description: 'Channel where the calendar embed is posted', type: 'select', value: rc?.channelId || '', options: channels },
          ];
          result.events = (rc?.events || []).map(e => ({
            id: e._id?.toString(),
            day: e.day,
            time: e.time,
            description: e.description,
            person: e.person,
            timezone: e.timezone,
          }));
          break;
        }

        case 'rolerequest': {
          result.name = 'Role Request';
          result.description = 'Allow members to request roles - staff approve or deny via DM';
          const { default: RoleRequestConfig } = await import('../../models/RoleRequestConfig.js');
          const rrc = await RoleRequestConfig.findOne({ guildId: guild.id });
          result.fields = [];
          result.requestableRoles = (rrc?.roles || []).map(r => ({
            roleId: r.roleId,
            roleName: guild.roles.cache.get(r.roleId)?.name || r.roleName || 'Unknown Role',
            approverRoleIds: r.approverRoleIds || [],
            approverRoleNames: (r.approverRoleIds || []).map(id => guild.roles.cache.get(id)?.name || id),
            approverRoleCount: r.approverRoleIds?.length || 0,
            approverMemberCount: r.approverMemberIds?.length || 0,
          }));
          result.roles = roles;
          result.stats = [
            { label: 'Requestable Roles', value: (rrc?.roles || []).length },
          ];
          break;
        }

        case 'economy': {
          result.name = 'Economy';
          result.description = 'Configure the server economy - currency, work, crime, gambling, and more';
          const { default: EconomyConfig } = await import('../../models/EconomyConfig.js');
          const { default: EconomyBalance } = await import('../../models/EconomyBalance.js');
          const ec = await EconomyConfig.findOne({ guildId: guild.id });
          result.fields = [
            { key: 'currencySymbol', label: 'Currency Symbol', description: 'Symbol shown next to all balances', type: 'text', value: ec?.currencySymbol || '$', placeholder: '$' },
            { key: 'startingBalance', label: 'Starting Balance', description: 'Cash given to new members on first interaction', type: 'number', value: ec?.startingBalance ?? 1000, min: 0, max: 1000000 },
            { key: 'maxBalance', label: 'Max Balance', description: 'Maximum cash a member can hold at once', type: 'number', value: ec?.maxBalance ?? 1000000, min: 1, max: 999999999 },
            { key: 'logChannelId', label: 'Log Channel', description: 'Channel where admin money actions are logged', type: 'select', value: ec?.logChannelId || '', options: channels },
            { key: 'work_enabled', label: 'Enable Work', description: 'Allow members to earn money with /economy work', type: 'toggle', value: ec?.work?.enabled ?? true },
            { key: 'work_cooldown', label: 'Work Cooldown (minutes)', description: 'How long members must wait between work uses', type: 'number', value: ec?.work?.cooldown ?? 60, min: 1, max: 1440 },
            { key: 'work_minPayout', label: 'Work Min Pay', description: 'Minimum earnings per work', type: 'number', value: ec?.work?.minPayout ?? 100, min: 1, max: 1000000 },
            { key: 'work_maxPayout', label: 'Work Max Pay', description: 'Maximum earnings per work', type: 'number', value: ec?.work?.maxPayout ?? 500, min: 1, max: 1000000 },
            { key: 'crime_enabled', label: 'Enable Crime', description: 'Allow members to commit crimes with /economy crime', type: 'toggle', value: ec?.crime?.enabled ?? true },
            { key: 'crime_cooldown', label: 'Crime Cooldown (minutes)', description: 'How long between crime uses', type: 'number', value: ec?.crime?.cooldown ?? 120, min: 1, max: 1440 },
            { key: 'crime_successRate', label: 'Crime Success Rate (%)', description: 'Chance that a crime attempt succeeds', type: 'number', value: ec?.crime?.successRate ?? 60, min: 1, max: 100 },
            { key: 'crime_minPayout', label: 'Crime Min Pay', description: 'Minimum earnings on a successful crime', type: 'number', value: ec?.crime?.minPayout ?? 200, min: 1, max: 1000000 },
            { key: 'crime_maxPayout', label: 'Crime Max Pay', description: 'Maximum earnings on a successful crime', type: 'number', value: ec?.crime?.maxPayout ?? 1000, min: 1, max: 1000000 },
            { key: 'crime_fineRate', label: 'Crime Fine Rate (%)', description: 'Percentage of max payout lost when caught', type: 'number', value: ec?.crime?.fineRate ?? 50, min: 0, max: 100 },
            { key: 'rob_enabled', label: 'Enable Rob', description: 'Allow members to rob others with /economy rob', type: 'toggle', value: ec?.rob?.enabled ?? true },
            { key: 'rob_cooldown', label: 'Rob Cooldown (minutes)', description: 'How long between rob attempts', type: 'number', value: ec?.rob?.cooldown ?? 180, min: 1, max: 1440 },
            { key: 'rob_successRate', label: 'Rob Success Rate (%)', description: 'Chance that robbing succeeds', type: 'number', value: ec?.rob?.successRate ?? 40, min: 1, max: 100 },
            { key: 'rob_maxStealPercent', label: 'Max Steal (%)', description: 'Max % of target\'s cash that can be stolen', type: 'number', value: ec?.rob?.maxStealPercent ?? 30, min: 1, max: 100 },
            { key: 'gambling_enabled', label: 'Enable Gambling', description: 'Allow gambling commands (blackjack, slots, etc.)', type: 'toggle', value: ec?.gambling?.enabled ?? true },
            { key: 'gambling_minBet', label: 'Min Bet', description: 'Minimum amount per gambling bet', type: 'number', value: ec?.gambling?.minBet ?? 10, min: 1, max: 1000000 },
            { key: 'gambling_maxBet', label: 'Max Bet', description: 'Maximum amount per gambling bet', type: 'number', value: ec?.gambling?.maxBet ?? 10000, min: 1, max: 1000000 },
            { key: 'gambling_cooldown', label: 'Gambling Cooldown (minutes)', description: 'Cooldown between gambling uses', type: 'number', value: ec?.gambling?.cooldown ?? 1, min: 0, max: 60 },
            { key: 'chatMoney_enabled', label: 'Enable Chat Money', description: 'Members earn money passively by sending messages', type: 'toggle', value: ec?.chatMoney?.enabled ?? false },
            { key: 'chatMoney_minAmount', label: 'Chat Min Earnings', description: 'Minimum cash earned per eligible message', type: 'number', value: ec?.chatMoney?.minAmount ?? 1, min: 1, max: 10000 },
            { key: 'chatMoney_maxAmount', label: 'Chat Max Earnings', description: 'Maximum cash earned per eligible message', type: 'number', value: ec?.chatMoney?.maxAmount ?? 10, min: 1, max: 10000 },
            { key: 'chatMoney_cooldown', label: 'Chat Money Cooldown (seconds)', description: 'Seconds before a member can earn again from chatting', type: 'number', value: ec?.chatMoney?.cooldown ?? 60, min: 1, max: 3600 },
          ];
          try {
            const totalMembers = await EconomyBalance.countDocuments({ guildId: guild.id });
            const totalAgg = await EconomyBalance.aggregate([{ $match: { guildId: guild.id } }, { $group: { _id: null, total: { $sum: { $add: ['$cash', '$bank'] } } } }]);
            const totalMoney = totalAgg[0]?.total || 0;
            result.stats = [
              { label: 'Members with Wallets', value: totalMembers },
              { label: 'Total Money in Server', value: (ec?.currencySymbol || '$') + totalMoney.toLocaleString() },
            ];
          } catch {}
          result.roleIncomeList = (ec?.roleIncome || []).map(r => ({
            roleId: r.roleId,
            roleName: guild.roles.cache.get(r.roleId)?.name || 'Unknown Role',
            amount: r.amount,
            cooldown: r.cooldown,
          }));
          result.roles = roles;
          // Store items
          try {
            const { default: EconomyStore } = await import('../../models/EconomyStore.js');
            const items = await EconomyStore.find({ guildId: guild.id }).lean();
            result.storeItems = items.map(i => ({
              id: i._id.toString(),
              name: i.name,
              price: i.price,
              description: i.description || '',
              usable: !!i.usable,
              roleId: i.roleId || null,
              roleName: i.roleId ? (guild.roles.cache.get(i.roleId)?.name || 'Unknown Role') : null,
            }));
          } catch { result.storeItems = []; }
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
    const token = getToken(req);
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
        case 'general': {
          const { default: Config } = await import('../../models/Config.js');
          const allowed = ['logChannelId', 'staffCanBypassLinks'];
          const update = {};
          for (const [k, v] of Object.entries(changes)) {
            if (allowed.includes(k)) update[k] = v;
          }
          await Config.findOneAndUpdate({ guildId: guild.id }, update, { upsert: true });
          break;
        }

        case 'antipromo': {
          const { default: Config } = await import('../../models/Config.js');
          const allowed = ['antiPromotingEnabled', 'antiPromotingLogChannelId', 'staffCanBypassLinks'];
          const update = {};
          for (const [k, v] of Object.entries(changes)) {
            if (allowed.includes(k)) update[k] = v;
          }
          await Config.findOneAndUpdate({ guildId: guild.id }, update, { upsert: true });
          break;
        }

        case 'tickets': {
          const { default: TicketConfig } = await import('../../models/TicketConfig.js');
          const allowed = ['panelChannelId', 'panelTitle', 'panelDescription'];
          const update = {};
          for (const [k, v] of Object.entries(changes)) {
            if (allowed.includes(k)) update[k] = v;
          }
          await TicketConfig.findOneAndUpdate({ guildId: guild.id }, update, { upsert: true });
          break;
        }

        case 'dispatch': {
          const { default: DispatchConfig } = await import('../../models/DispatchConfig.js');
          const allowed = ['aiEnabled', 'dispatchChannelId', 'statusBoardChannelId', 'patrolChannelIds', 'trafficStopChannelIds', 'leoRoleIds'];
          const update = {};
          for (const [k, v] of Object.entries(changes)) {
            if (allowed.includes(k)) update[k] = v;
          }
          await DispatchConfig.findOneAndUpdate({ guildId: guild.id }, update, { upsert: true });
          break;
        }

        case 'priority': {
          const { default: Priority } = await import('../../models/Priority.js');
          const allowed = ['channelId', 'cooldownMinutes'];
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
          const allowed = ['channelId', 'welcomeMessage', 'welcomeDM'];
          const update = {};
          for (const [k, v] of Object.entries(changes)) {
            if (allowed.includes(k)) update[k] = v;
          }
          await Welcome.findOneAndUpdate({ guildId: guild.id }, update, { upsert: true });
          break;
        }

        case 'verification': {
          const { default: Verification } = await import('../../models/Verification.js');
          const allowed = ['verifyChannelId', 'approvalChannelId', 'verifiedRoleId', 'unverifiedRoleId', 'approvalRequired', 'rpTag', 'verifyDMMessage'];
          const update = {};
          for (const [k, v] of Object.entries(changes)) {
            if (allowed.includes(k)) update[k] = v;
          }
          await Verification.findOneAndUpdate({ guildId: guild.id }, update, { upsert: true });
          break;
        }

        case 'strikes': {
          const { StrikeConfig } = await import('../../models/Strike.js');
          const update = {};
          for (const [k, v] of Object.entries(changes)) {
            const match = k.match(/^(strike[1-4])_(roleId|action|duration)$/);
            if (match) {
              const [, level, field] = match;
              if (!update[`strikes.${level}.${field}`]) {
                update[`strikes.${level}.${field}`] = v;
              }
            }
          }
          if (Object.keys(update).length > 0) {
            await StrikeConfig.findOneAndUpdate({ guildId: guild.id }, { $set: update }, { upsert: true });
          }
          break;
        }

        case 'roleplay': {
          const { default: RoleplayCommands } = await import('../../models/RoleplayCommands.js');
          const allowed = ['use911', 'use911Channel', 'useTwitter', 'twitterChannel', 'useAnon', 'anonChannel', 'useCAD', 'cadChannel'];
          const update = {};
          for (const [k, v] of Object.entries(changes)) {
            if (allowed.includes(k)) update[k] = v;
          }
          await RoleplayCommands.findOneAndUpdate({ guildId: guild.id }, update, { upsert: true });
          break;
        }

        case 'calendar': {
          const { default: RoleplayCalendar } = await import('../../models/RoleplayCalendar.js');
          const allowed = ['channelId'];
          const update = {};
          for (const [k, v] of Object.entries(changes)) {
            if (allowed.includes(k)) update[k] = v;
          }
          await RoleplayCalendar.findOneAndUpdate({ guildId: guild.id }, update, { upsert: true });
          break;
        }

        case 'economy': {
          const { default: EconomyConfig } = await import('../../models/EconomyConfig.js');
          const ec = await EconomyConfig.findOne({ guildId: guild.id }) || new EconomyConfig({ guildId: guild.id });
          const topLevel = ['currencySymbol', 'startingBalance', 'maxBalance', 'logChannelId'];
          const nestedMap = {
            work_enabled: ['work', 'enabled'],
            work_cooldown: ['work', 'cooldown'],
            work_minPayout: ['work', 'minPayout'],
            work_maxPayout: ['work', 'maxPayout'],
            crime_enabled: ['crime', 'enabled'],
            crime_cooldown: ['crime', 'cooldown'],
            crime_successRate: ['crime', 'successRate'],
            crime_minPayout: ['crime', 'minPayout'],
            crime_maxPayout: ['crime', 'maxPayout'],
            crime_fineRate: ['crime', 'fineRate'],
            rob_enabled: ['rob', 'enabled'],
            rob_cooldown: ['rob', 'cooldown'],
            rob_successRate: ['rob', 'successRate'],
            rob_maxStealPercent: ['rob', 'maxStealPercent'],
            gambling_enabled: ['gambling', 'enabled'],
            gambling_minBet: ['gambling', 'minBet'],
            gambling_maxBet: ['gambling', 'maxBet'],
            gambling_cooldown: ['gambling', 'cooldown'],
            chatMoney_enabled: ['chatMoney', 'enabled'],
            chatMoney_minAmount: ['chatMoney', 'minAmount'],
            chatMoney_maxAmount: ['chatMoney', 'maxAmount'],
            chatMoney_cooldown: ['chatMoney', 'cooldown'],
          };
          const numericFields = new Set(['startingBalance', 'maxBalance', 'work_cooldown', 'work_minPayout', 'work_maxPayout', 'crime_cooldown', 'crime_successRate', 'crime_minPayout', 'crime_maxPayout', 'crime_fineRate', 'rob_cooldown', 'rob_successRate', 'rob_maxStealPercent', 'gambling_minBet', 'gambling_maxBet', 'gambling_cooldown', 'chatMoney_minAmount', 'chatMoney_maxAmount', 'chatMoney_cooldown']);
          for (const [k, v] of Object.entries(changes)) {
            const val = numericFields.has(k) ? Number(v) : v;
            if (topLevel.includes(k)) {
              ec[k] = val;
            } else if (nestedMap[k]) {
              const [section, field] = nestedMap[k];
              ec[section][field] = val;
              ec.markModified(section);
            }
          }
          await ec.save();
          break;
        }

        case 'rolerequest': {
          // Role request roles are managed via /rolerequestadd in Discord - nothing to save here
          break;
        }

        default:
          return res.status(404).json({ error: 'Module not found' });
      }

      res.json({ success: true });
    } catch (err) {
      console.error(`[DASHBOARD] Settings save error (${mod}):`, err.message);
      res.status(500).json({ error: 'Failed to save settings' });
    }
  });

  /* ── Ticket Types CRUD ── */
  router.post('/guild/:id/settings/tickets/types', async (req, res) => {
    const token = getToken(req);
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const isAdmin = await verifyAdminAccess(token, req.params.id);
      if (!isAdmin) return res.status(403).json({ error: 'No admin access' });
    } catch { return res.status(401).json({ error: 'Invalid token' }); }
    const guild = client.guilds.cache.get(req.params.id);
    if (!guild) return res.status(404).json({ error: 'Guild not found' });
    const { label, allowedRoleIds, buttonColor } = req.body;
    if (!label || !label.trim()) return res.status(400).json({ error: 'Ticket type label is required' });
    try {
      const { default: TicketConfig } = await import('../../models/TicketConfig.js');
      const { isPremiumGuild } = await import('../../utils/premiumCheck.js');
      const tc = await TicketConfig.findOne({ guildId: req.params.id }) || new TicketConfig({ guildId: req.params.id });
      const isPrem = await isPremiumGuild(req.params.id);
      const limit = isPrem ? Infinity : 3;
      if ((tc.ticketTypes || []).length >= limit) {
        return res.status(403).json({ error: 'Free servers can have up to 3 ticket types. Upgrade to Premium for unlimited.' });
      }
      const { v4: uuidv4 } = await import('uuid');
      tc.ticketTypes.push({
        id: uuidv4(),
        label: label.trim(),
        allowedRoleIds: Array.isArray(allowedRoleIds) ? allowedRoleIds : [],
        buttonColor: buttonColor || 'Primary',
        createdAt: new Date(),
      });
      await tc.save();
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.delete('/guild/:id/settings/tickets/types/:typeId', async (req, res) => {
    const token = getToken(req);
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const isAdmin = await verifyAdminAccess(token, req.params.id);
      if (!isAdmin) return res.status(403).json({ error: 'No admin access' });
    } catch { return res.status(401).json({ error: 'Invalid token' }); }
    try {
      const { default: TicketConfig } = await import('../../models/TicketConfig.js');
      const tc = await TicketConfig.findOne({ guildId: req.params.id });
      if (tc) {
        tc.ticketTypes = tc.ticketTypes.filter(t => (t.id || t._id?.toString()) !== req.params.typeId);
        await tc.save();
      }
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  /* ── Role Request Roles CRUD ── */
  router.post('/guild/:id/rolerequest/roles', async (req, res) => {
    const token = getToken(req);
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const isAdmin = await verifyAdminAccess(token, req.params.id);
      if (!isAdmin) return res.status(403).json({ error: 'No admin access' });
    } catch { return res.status(401).json({ error: 'Invalid token' }); }
    const guild = client.guilds.cache.get(req.params.id);
    if (!guild) return res.status(404).json({ error: 'Guild not found' });
    const { roleId, approverRoleIds } = req.body;
    if (!roleId) return res.status(400).json({ error: 'Role is required' });
    const role = guild.roles.cache.get(roleId);
    if (!role) return res.status(404).json({ error: 'Role not found in this server' });
    try {
      const { default: RoleRequestConfig } = await import('../../models/RoleRequestConfig.js');
      const { v4: uuidv4 } = await import('uuid');
      const rrc = await RoleRequestConfig.findOne({ guildId: req.params.id }) || new RoleRequestConfig({ guildId: req.params.id });
      const existing = (rrc.roles || []).findIndex(r => r.roleId === roleId);
      if (existing >= 0) {
        rrc.roles[existing].approverRoleIds = Array.isArray(approverRoleIds) ? approverRoleIds : [];
        rrc.roles[existing].roleName = role.name;
      } else {
        rrc.roles.push({ id: uuidv4(), roleId, roleName: role.name, approverRoleIds: Array.isArray(approverRoleIds) ? approverRoleIds : [], approverMemberIds: [], createdAt: new Date() });
      }
      rrc.markModified('roles');
      await rrc.save();
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.delete('/guild/:id/rolerequest/roles/:roleId', async (req, res) => {
    const token = getToken(req);
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const isAdmin = await verifyAdminAccess(token, req.params.id);
      if (!isAdmin) return res.status(403).json({ error: 'No admin access' });
    } catch { return res.status(401).json({ error: 'Invalid token' }); }
    try {
      const { default: RoleRequestConfig } = await import('../../models/RoleRequestConfig.js');
      const rrc = await RoleRequestConfig.findOne({ guildId: req.params.id });
      if (rrc) {
        rrc.roles = rrc.roles.filter(r => r.roleId !== req.params.roleId);
        rrc.markModified('roles');
        await rrc.save();
      }
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  /* ── Anti-Promoting Whitelist CRUD ── */
  router.post('/guild/:id/settings/antipromo/links', async (req, res) => {
    const token = getToken(req);
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const isAdmin = await verifyAdminAccess(token, req.params.id);
      if (!isAdmin) return res.status(403).json({ error: 'No admin access' });
    } catch { return res.status(401).json({ error: 'Invalid token' }); }
    const { link } = req.body;
    if (!link || !link.trim()) return res.status(400).json({ error: 'Link is required' });
    try {
      const { default: Config } = await import('../../models/Config.js');
      const config = await Config.findOne({ guildId: req.params.id }) || new Config({ guildId: req.params.id });
      const clean = link.trim().toLowerCase();
      if (!(config.whitelistedInviteLinks || []).includes(clean)) {
        config.whitelistedInviteLinks = [...(config.whitelistedInviteLinks || []), clean];
        await config.save();
      }
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.delete('/guild/:id/settings/antipromo/links', async (req, res) => {
    const token = getToken(req);
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const isAdmin = await verifyAdminAccess(token, req.params.id);
      if (!isAdmin) return res.status(403).json({ error: 'No admin access' });
    } catch { return res.status(401).json({ error: 'Invalid token' }); }
    const { link } = req.body;
    if (!link) return res.status(400).json({ error: 'Link is required' });
    try {
      const { default: Config } = await import('../../models/Config.js');
      const config = await Config.findOne({ guildId: req.params.id });
      if (config) {
        config.whitelistedInviteLinks = (config.whitelistedInviteLinks || []).filter(l => l !== link.trim().toLowerCase());
        await config.save();
      }
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  /* ── Calendar Events CRUD ── */
  router.post('/guild/:id/settings/calendar/events', async (req, res) => {
    const token = getToken(req);
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const isAdmin = await verifyAdminAccess(token, req.params.id);
      if (!isAdmin) return res.status(403).json({ error: 'No admin access' });
    } catch { return res.status(401).json({ error: 'Invalid token' }); }
    const { day, time, description, person, timezone } = req.body;
    if (!day) return res.status(400).json({ error: 'Day is required' });
    if (!description || !description.trim()) return res.status(400).json({ error: 'Description is required' });
    try {
      const { default: RoleplayCalendar } = await import('../../models/RoleplayCalendar.js');
      const rc = await RoleplayCalendar.findOne({ guildId: req.params.id }) || new RoleplayCalendar({ guildId: req.params.id });
      rc.events.push({ day, time: time || '', description: description.trim(), person: person?.trim() || '', timezone: timezone || 'ET' });
      await rc.save();
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.delete('/guild/:id/settings/calendar/events/:eventId', async (req, res) => {
    const token = getToken(req);
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const isAdmin = await verifyAdminAccess(token, req.params.id);
      if (!isAdmin) return res.status(403).json({ error: 'No admin access' });
    } catch { return res.status(401).json({ error: 'Invalid token' }); }
    try {
      const { default: RoleplayCalendar } = await import('../../models/RoleplayCalendar.js');
      const rc = await RoleplayCalendar.findOne({ guildId: req.params.id });
      if (rc) {
        rc.events = rc.events.filter(e => e._id?.toString() !== req.params.eventId);
        await rc.save();
      }
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/guild/:id/premium/cancel', async (req, res) => {
    const token = getToken(req);
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    try {
      const isAdmin = await verifyAdminAccess(token, req.params.id);
      if (!isAdmin) return res.status(403).json({ error: 'No admin access' });
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const guildId = req.params.id;

    try {
      const { default: PremiumKey } = await import('../../models/PremiumKey.js');
      const premiumKey = await PremiumKey.findOne({ guildId });
      if (!premiumKey) return res.status(404).json({ error: 'No active premium key found for this server' });
      if (premiumKey.plan !== 'monthly') return res.status(400).json({ error: 'Only monthly subscriptions can be cancelled. Lifetime keys do not expire.' });
      if (!premiumKey.stripeSubscriptionId) return res.status(400).json({ error: 'No subscription found. This key was not purchased through Stripe.' });
      if (premiumKey.subscriptionStatus === 'canceled' || premiumKey.subscriptionStatus === 'cancelled') {
        return res.status(400).json({ error: 'This subscription is already cancelled.' });
      }

      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) return res.status(503).json({ error: 'Payment processing not configured.' });

      const { default: Stripe } = await import('stripe');
      const stripe = new Stripe(stripeKey, { apiVersion: '2024-04-10' });

      await stripe.subscriptions.update(premiumKey.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });

      premiumKey.subscriptionStatus = 'cancelling';
      await premiumKey.save();

      res.json({ success: true, periodEnd: premiumKey.subscriptionCurrentPeriodEnd });
    } catch (err) {
      console.error('[DASHBOARD] Premium cancel error:', err.message);
      res.status(500).json({ error: 'Failed to cancel subscription. Please try again.' });
    }
  });

  router.post('/guild/:id/premium/reactivate', async (req, res) => {
    const token = getToken(req);
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    try {
      const isAdmin = await verifyAdminAccess(token, req.params.id);
      if (!isAdmin) return res.status(403).json({ error: 'No admin access' });
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const guildId = req.params.id;

    try {
      const { default: PremiumKey } = await import('../../models/PremiumKey.js');
      const premiumKey = await PremiumKey.findOne({ guildId });
      if (!premiumKey) return res.status(404).json({ error: 'No active premium key found for this server' });
      if (premiumKey.plan !== 'monthly') return res.status(400).json({ error: 'Only monthly subscriptions can be reactivated.' });
      if (!premiumKey.stripeSubscriptionId) return res.status(400).json({ error: 'No Stripe subscription found for this key.' });
      if (premiumKey.subscriptionStatus !== 'cancelling') {
        return res.status(400).json({ error: 'Subscription is not pending cancellation.' });
      }

      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) return res.status(503).json({ error: 'Payment processing not configured.' });

      const { default: Stripe } = await import('stripe');
      const stripe = new Stripe(stripeKey, { apiVersion: '2024-04-10' });

      await stripe.subscriptions.update(premiumKey.stripeSubscriptionId, {
        cancel_at_period_end: false,
      });

      premiumKey.subscriptionStatus = 'active';
      await premiumKey.save();

      res.json({ success: true });
    } catch (err) {
      console.error('[DASHBOARD] Premium reactivate error:', err.message);
      res.status(500).json({ error: 'Failed to reactivate subscription. Please try again.' });
    }
  });

  router.get('/guild/:id/premium/billing', async (req, res) => {
    const token = getToken(req);
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    try {
      const isAdmin = await verifyAdminAccess(token, req.params.id);
      if (!isAdmin) return res.status(403).json({ error: 'No admin access' });
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const guildId = req.params.id;

    try {
      const { default: PremiumKey } = await import('../../models/PremiumKey.js');
      const premiumKey = await PremiumKey.findOne({ guildId });
      if (!premiumKey) return res.status(404).json({ error: 'No active premium key found for this server' });

      const billing = {
        plan: premiumKey.plan || 'manual',
        status: premiumKey.subscriptionStatus || null,
        activatedAt: premiumKey.activatedAt || null,
        purchasedAt: premiumKey.tosAcceptedAt || premiumKey.createdAt || null,
        currentPeriodEnd: premiumKey.subscriptionCurrentPeriodEnd || null,
        hasStripeSubscription: !!premiumKey.stripeSubscriptionId,
        invoices: [],
      };

      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (stripeKey && premiumKey.stripeCustomerId) {
        try {
          const { default: Stripe } = await import('stripe');
          const stripe = new Stripe(stripeKey, { apiVersion: '2024-04-10' });
          const invoiceList = await stripe.invoices.list({
            customer: premiumKey.stripeCustomerId,
            limit: 12,
          });
          billing.invoices = invoiceList.data.map(inv => ({
            id: inv.id,
            date: inv.created ? new Date(inv.created * 1000).toISOString() : null,
            amount: inv.amount_paid,
            currency: inv.currency,
            status: inv.status,
            receiptUrl: inv.hosted_invoice_url || null,
            periodStart: inv.period_start ? new Date(inv.period_start * 1000).toISOString() : null,
            periodEnd: inv.period_end ? new Date(inv.period_end * 1000).toISOString() : null,
          }));
        } catch (stripeErr) {
          console.error('[BILLING] Stripe invoice fetch error:', stripeErr.message);
        }
      }

      res.json(billing);
    } catch (err) {
      console.error('[DASHBOARD] Billing error:', err.message);
      res.status(500).json({ error: 'Failed to load billing information' });
    }
  });

  router.post('/guild/:id/premium/transfer', async (req, res) => {
    const token = getToken(req);
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    try {
      const isAdmin = await verifyAdminAccess(token, req.params.id);
      if (!isAdmin) return res.status(403).json({ error: 'No admin access' });
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const guildId = req.params.id;

    try {
      const { default: PremiumKey } = await import('../../models/PremiumKey.js');
      const premiumKey = await PremiumKey.findOne({ guildId });
      if (!premiumKey) return res.status(404).json({ error: 'No active premium key found for this server' });

      const keyValue = premiumKey.key;
      premiumKey.guildId = null;
      premiumKey.guildName = null;
      premiumKey.activatedBy = null;
      premiumKey.activatedAt = null;
      await premiumKey.save();

      res.json({ success: true, key: keyValue });
    } catch (err) {
      console.error('[DASHBOARD] Premium transfer error:', err.message);
      res.status(500).json({ error: 'Failed to transfer premium key' });
    }
  });

  router.post('/guild/:id/premium', async (req, res) => {
    const token = getToken(req);
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    try {
      const isAdmin = await verifyAdminAccess(token, req.params.id);
      if (!isAdmin) return res.status(403).json({ error: 'No admin access' });
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const guildId = req.params.id;
    const { key } = req.body;

    if (!key || typeof key !== 'string' || !key.trim()) {
      return res.status(400).json({ error: 'A premium key is required' });
    }

    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({ error: 'Guild not found' });

    try {
      const { default: PremiumKey } = await import('../../models/PremiumKey.js');

      const existing = await PremiumKey.findOne({ guildId });
      if (existing) return res.status(400).json({ error: 'This server already has an active premium key' });

      const premiumKey = await PremiumKey.findOne({ key: key.trim(), guildId: null });
      if (!premiumKey) return res.status(404).json({ error: 'Invalid or already used premium key' });

      premiumKey.guildId = guildId;
      premiumKey.guildName = guild.name;
      premiumKey.activatedBy = req.headers.authorization?.slice(7) || 'unknown';
      premiumKey.activatedAt = new Date();
      await premiumKey.save();

      res.json({ success: true });
    } catch (err) {
      console.error('[DASHBOARD] Premium activation error:', err.message);
      res.status(500).json({ error: 'Failed to activate premium key' });
    }
  });

  /* ── Economy Store CRUD ── */
  router.get('/guild/:id/economy/store', async (req, res) => {
    const token = getToken(req);
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const isAdmin = await verifyAdminAccess(token, req.params.id);
      if (!isAdmin) return res.status(403).json({ error: 'No admin access' });
    } catch { return res.status(401).json({ error: 'Invalid token' }); }
    const guild = client.guilds.cache.get(req.params.id);
    if (!guild) return res.status(404).json({ error: 'Guild not found' });
    try {
      const { default: EconomyStore } = await import('../../models/EconomyStore.js');
      const items = await EconomyStore.find({ guildId: req.params.id }).lean();
      res.json(items.map(i => ({
        id: i._id.toString(), name: i.name, price: i.price,
        description: i.description || '', usable: !!i.usable,
        roleId: i.roleId || null,
        roleName: i.roleId ? (guild.roles.cache.get(i.roleId)?.name || 'Unknown Role') : null,
      })));
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/guild/:id/economy/store', async (req, res) => {
    const token = getToken(req);
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const isAdmin = await verifyAdminAccess(token, req.params.id);
      if (!isAdmin) return res.status(403).json({ error: 'No admin access' });
    } catch { return res.status(401).json({ error: 'Invalid token' }); }
    const guild = client.guilds.cache.get(req.params.id);
    if (!guild) return res.status(404).json({ error: 'Guild not found' });
    const { name, price, description, usable, roleId } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Item name is required' });
    if (price === undefined || isNaN(Number(price)) || Number(price) < 0) return res.status(400).json({ error: 'Valid price is required' });
    try {
      const { default: EconomyStore } = await import('../../models/EconomyStore.js');
      const item = await EconomyStore.create({
        guildId: req.params.id, name: name.trim(), price: Number(price),
        description: description?.trim() || '', usable: !!usable,
        roleId: roleId || null,
      });
      res.json({ success: true, id: item._id.toString() });
    } catch (err) {
      if (err.code === 11000) return res.status(400).json({ error: 'An item with that name already exists' });
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/guild/:id/economy/store/:itemId', async (req, res) => {
    const token = getToken(req);
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const isAdmin = await verifyAdminAccess(token, req.params.id);
      if (!isAdmin) return res.status(403).json({ error: 'No admin access' });
    } catch { return res.status(401).json({ error: 'Invalid token' }); }
    try {
      const { default: EconomyStore } = await import('../../models/EconomyStore.js');
      await EconomyStore.findOneAndDelete({ _id: req.params.itemId, guildId: req.params.id });
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  /* ── Economy Role Income CRUD ── */
  router.post('/guild/:id/economy/roleincome', async (req, res) => {
    const token = getToken(req);
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const isAdmin = await verifyAdminAccess(token, req.params.id);
      if (!isAdmin) return res.status(403).json({ error: 'No admin access' });
    } catch { return res.status(401).json({ error: 'Invalid token' }); }
    const guild = client.guilds.cache.get(req.params.id);
    if (!guild) return res.status(404).json({ error: 'Guild not found' });
    const { roleId, amount, cooldown } = req.body;
    if (!roleId) return res.status(400).json({ error: 'Role is required' });
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) return res.status(400).json({ error: 'Valid amount is required' });
    const hours = Math.max(1, Math.min(720, parseInt(cooldown) || 24));
    try {
      const { default: EconomyConfig } = await import('../../models/EconomyConfig.js');
      const { clearPremiumCache, isPremiumGuild } = await import('../../utils/premiumCheck.js');
      const isPremium = await isPremiumGuild(req.params.id);
      const ec = await EconomyConfig.findOne({ guildId: req.params.id }) || new EconomyConfig({ guildId: req.params.id });
      const limit = isPremium ? Infinity : 2;
      if ((ec.roleIncome || []).length >= limit) {
        return res.status(403).json({ error: 'Free servers can have up to 2 role income entries. Upgrade to Premium for unlimited.' });
      }
      const existing = (ec.roleIncome || []).findIndex(r => r.roleId === roleId);
      if (existing >= 0) {
        ec.roleIncome[existing].amount = Number(amount);
        ec.roleIncome[existing].cooldown = hours;
      } else {
        ec.roleIncome.push({ roleId, amount: Number(amount), cooldown: hours });
      }
      ec.markModified('roleIncome');
      await ec.save();
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.delete('/guild/:id/economy/roleincome/:roleId', async (req, res) => {
    const token = getToken(req);
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const isAdmin = await verifyAdminAccess(token, req.params.id);
      if (!isAdmin) return res.status(403).json({ error: 'No admin access' });
    } catch { return res.status(401).json({ error: 'Invalid token' }); }
    try {
      const { default: EconomyConfig } = await import('../../models/EconomyConfig.js');
      const ec = await EconomyConfig.findOne({ guildId: req.params.id });
      if (ec) {
        ec.roleIncome = (ec.roleIncome || []).filter(r => r.roleId !== req.params.roleId);
        ec.markModified('roleIncome');
        await ec.save();
      }
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  /* ── Ticket Panel Send (from web dashboard) ── */
  router.post('/guild/:id/settings/tickets/panel/send', async (req, res) => {
    const token = getToken(req);
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const isAdmin = await verifyAdminAccess(token, req.params.id);
      if (!isAdmin) return res.status(403).json({ error: 'No admin access' });
    } catch { return res.status(401).json({ error: 'Invalid token' }); }
    const guild = client.guilds.cache.get(req.params.id);
    if (!guild) return res.status(404).json({ error: 'Guild not found' });
    try {
      const { default: TicketConfig } = await import('../../models/TicketConfig.js');
      const { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = await import('discord.js');
      const tc = await TicketConfig.findOne({ guildId: req.params.id });
      if (!tc || !tc.enabled) return res.status(400).json({ error: 'Ticket system is not enabled. Enable it in Discord first with /enablecommands.' });
      if (!tc.panelChannelId) return res.status(400).json({ error: 'No panel channel set. Configure the Panel Channel above and save first.' });
      if (!tc.ticketTypes || tc.ticketTypes.length === 0) return res.status(400).json({ error: 'No ticket types configured. Add at least one type above first.' });
      const channel = guild.channels.cache.get(tc.panelChannelId);
      if (!channel) return res.status(400).json({ error: 'Panel channel not found in this server. Make sure it exists.' });
      const buttonStyles = { Primary: ButtonStyle.Primary, Secondary: ButtonStyle.Secondary, Success: ButtonStyle.Success, Danger: ButtonStyle.Danger };
      const embed = new EmbedBuilder()
        .setColor('#2d2d2d')
        .setTitle(tc.panelTitle || 'Support Tickets')
        .setDescription(tc.panelDescription || 'Select a category below to open a support ticket. A private channel will be created for you.')
        .setFooter({ text: 'RPM' })
        .setTimestamp();
      const buttons = tc.ticketTypes.map(type =>
        new ButtonBuilder()
          .setCustomId(`ticket_create_${type.id}`)
          .setLabel(type.label)
          .setStyle(buttonStyles[type.buttonColor] || ButtonStyle.Primary)
      );
      const rows = [];
      for (let i = 0; i < buttons.length; i += 5) {
        rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
      }
      await channel.send({ embeds: [embed], components: rows });
      res.json({ success: true });
    } catch (err) {
      console.error('[API] Ticket panel send error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  /* ── Calendar Post (from web dashboard) ── */
  router.post('/guild/:id/settings/calendar/post', async (req, res) => {
    const token = getToken(req);
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const isAdmin = await verifyAdminAccess(token, req.params.id);
      if (!isAdmin) return res.status(403).json({ error: 'No admin access' });
    } catch { return res.status(401).json({ error: 'Invalid token' }); }
    const guild = client.guilds.cache.get(req.params.id);
    if (!guild) return res.status(404).json({ error: 'Guild not found' });
    try {
      const { default: RoleplayCalendar } = await import('../../models/RoleplayCalendar.js');
      const { buildCalendarEmbed } = await import('../../utils/calendarBuilder.js');
      const rc = await RoleplayCalendar.findOne({ guildId: req.params.id });
      if (!rc || !rc.enabled) return res.status(400).json({ error: 'Calendar not enabled. Enable it in Discord first with /enablecommands.' });
      if (!rc.channelId) return res.status(400).json({ error: 'No calendar channel set. Configure the Calendar Channel above and save first.' });
      const channel = guild.channels.cache.get(rc.channelId);
      if (!channel) return res.status(400).json({ error: 'Calendar channel not found in this server.' });
      const embed = buildCalendarEmbed(rc);
      let posted = false;
      if (rc.messageId) {
        try {
          const msg = await channel.messages.fetch(rc.messageId);
          await msg.edit({ embeds: [embed] });
          posted = true;
        } catch {}
      }
      if (!posted) {
        const msg = await channel.send({ embeds: [embed] });
        rc.messageId = msg.id;
        await rc.save();
      }
      res.json({ success: true });
    } catch (err) {
      console.error('[API] Calendar post error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  /* ── Internal panic endpoint - called by the portal when an officer hits the panic button ── */
  router.post('/internal/panic', async (req, res) => {
    const secret = req.headers['x-internal-secret'];
    const expected = process.env.PORTAL_INTERNAL_SECRET;
    if (expected && secret !== expected) return res.status(401).json({ error: 'Unauthorized' });

    const { guildId, officerName, location } = req.body;
    if (!guildId) return res.status(400).json({ error: 'guildId required' });

    res.json({ success: true });

    setImmediate(async () => {
      try {
        const { playDispatchVoice } = await import('../../utils/voiceListener.js');
        const { generateDispatchTTSPublic, PANIC_SOUND_BUFFER } = await import('../../handlers/dispatchHandler.js');
        const loc = location ? ` at ${location}` : '';
        const ttsText = `Attention all units, 10-99, officer ${officerName} is in distress${loc}. All units respond immediately. This is not a drill.`;
        if (PANIC_SOUND_BUFFER) {
          await playDispatchVoice(guildId, PANIC_SOUND_BUFFER, { urgent: true, skipRadioWave: true });
          await new Promise(r => setTimeout(r, 600));
        }
        const ttsBuffer = await generateDispatchTTSPublic(ttsText);
        await playDispatchVoice(guildId, ttsBuffer, { urgent: false });
      } catch (err) {
        console.error('[Internal /panic] TTS error:', err.message);
      }
    });
  });

  return router;
}
