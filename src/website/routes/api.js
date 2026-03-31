import { Router } from 'express';
import axios from 'axios';
import Announcement from '../../models/Announcement.js';
import Changelog from '../../models/Changelog.js';
import PreviewVideo from '../../models/PreviewVideo.js';
import FeatureFlag from '../../models/FeatureFlag.js';
import { checkFeatureAccess } from '../../utils/premiumCheck.js';

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

  router.get('/stats', (req, res) => {
    const servers = client.guilds.cache.size;
    const users = client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);
    res.json({ servers, users });
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

      let premium = false;
      try {
        const { default: PremiumKey } = await import('../../models/PremiumKey.js');
        const key = await PremiumKey.findOne({ guildId: guild.id });
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
            { key: 'staffCanBypassLinks', label: 'Staff Bypass Links', description: 'Allow staff members to post invite links without being flagged', type: 'toggle', value: config?.staffCanBypassLinks ?? true },
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
          if (tc?.ticketTypes?.length > 0) {
            result.ticketTypes = tc.ticketTypes.map(t => ({
              id: t.id || t._id?.toString(),
              label: t.label,
              allowedRoleIds: t.allowedRoleIds || [],
            }));
          }
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
          result.description = 'AI-powered voice dispatch for law enforcement roleplay (Premium)';
          result.premium = true;
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
          if (config?.whitelistedInviteLinks?.length > 0) {
            result.whitelistedLinks = config.whitelistedInviteLinks;
          }
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
          if (rc?.events?.length > 0) {
            result.events = rc.events.map(e => ({
              day: e.day,
              time: e.time,
              description: e.description,
              person: e.person,
              timezone: e.timezone,
            }));
          }
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

        default:
          return res.status(404).json({ error: 'Module not found' });
      }

      res.json({ success: true });
    } catch (err) {
      console.error(`[DASHBOARD] Settings save error (${mod}):`, err.message);
      res.status(500).json({ error: 'Failed to save settings' });
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

  return router;
}
