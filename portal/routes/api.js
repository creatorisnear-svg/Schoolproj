import { Router } from 'express';
import { portalAuth, fetchGuildMember } from './auth.js';
import axios from 'axios';

import CADCharacter from '../../src/models/CADCharacter.js';
import CADConfig from '../../src/models/CADConfig.js';
import EconomyBalance from '../../src/models/EconomyBalance.js';
import EconomyStore from '../../src/models/EconomyStore.js';
import EconomyInventory from '../../src/models/EconomyInventory.js';
import EconomyConfig from '../../src/models/EconomyConfig.js';
import BOLO from '../../src/models/BOLO.js';
import RoleRequestConfig from '../../src/models/RoleRequestConfig.js';
import RoleRequest from '../../src/models/RoleRequest.js';
import EmergencyCall from '../../src/models/EmergencyCall.js';
import DispatchConfig from '../../src/models/DispatchConfig.js';
import Ticket from '../../src/models/Ticket.js';
import Priority from '../../src/models/Priority.js';
import RoleplayCalendar from '../../src/models/RoleplayCalendar.js';
import { StrikeUser } from '../../src/models/Strike.js';
import TrafficTicket from '../../src/models/TrafficTicket.js';
import OfficerStatus from '../../src/models/OfficerStatus.js';

const GUILD_ID = () => process.env.PORTAL_GUILD_ID;

const DISCORD_BASE = 'https://discord.com/api/v10';
const botHeaders = () => ({ Authorization: `Bot ${process.env.DISCORD_TOKEN}`, 'Content-Type': 'application/json' });

async function getLeoStatus(roleIds, guildId) {
  const cadConfig = await CADConfig.findOne({ guildId });
  if (!cadConfig) return false;
  const leoRoles = cadConfig.leoRoleIds || [];
  const staffRoles = cadConfig.staffRoleIds || [];
  return [...leoRoles, ...staffRoles].some(id => roleIds.includes(id));
}

async function refreshMemberRoles(userId) {
  try {
    const member = await fetchGuildMember(userId);
    return member?.roles || [];
  } catch {
    return null;
  }
}

async function requireLeo(req, res, next) {
  const guildId = GUILD_ID();
  if (!guildId) return res.status(403).json({ error: 'Not configured' });
  const freshRoles = await refreshMemberRoles(req.portalUser.userId);
  if (!freshRoles) return res.status(403).json({ error: 'Could not verify roles' });
  const allowed = await getLeoStatus(freshRoles, guildId);
  if (!allowed) return res.status(403).json({ error: 'LEO access required' });
  next();
}

export function createApiRouter() {
  const router = Router();

  /* ══════════════════════ /me ══════════════════════ */
  router.get('/me', portalAuth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      const { userId, username, displayName, avatar } = req.portalUser;

      const freshRoles = await refreshMemberRoles(userId);
      if (freshRoles === null) return res.status(401).json({ error: 'not_member' });

      const isLeo = guildId ? await getLeoStatus(freshRoles, guildId) : false;

      let serverName = process.env.PORTAL_SERVER_NAME || 'Member Portal';
      let serverIcon = null;
      try {
        const gRes = await axios.get(`${DISCORD_BASE}/guilds/${guildId}`, { headers: botHeaders() });
        serverName = gRes.data.name || serverName;
        if (gRes.data.icon) serverIcon = `https://cdn.discordapp.com/icons/${guildId}/${gRes.data.icon}.png`;
      } catch { /* use defaults */ }

      let roleDetails = [];
      try {
        const rRes = await axios.get(`${DISCORD_BASE}/guilds/${guildId}/roles`, { headers: botHeaders() });
        roleDetails = rRes.data
          .filter(r => freshRoles.includes(r.id) && r.name !== '@everyone')
          .sort((a, b) => b.position - a.position)
          .slice(0, 8)
          .map(r => ({ id: r.id, name: r.name, color: r.color ? `#${r.color.toString(16).padStart(6, '0')}` : null }));
      } catch { /* skip */ }

      res.json({
        userId, username, displayName, isLeo, serverName, serverIcon, roles: roleDetails,
        avatar: avatar
          ? `https://cdn.discordapp.com/avatars/${userId}/${avatar}.png?size=128`
          : `https://cdn.discordapp.com/embed/avatars/${parseInt(userId) % 5}.png`,
      });
    } catch (err) {
      console.error('[API /me]', err.message);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  /* ══════════════════════ /priority ══════════════════════ */
  router.get('/priority', portalAuth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId) return res.json({ active: false });
      const p = await Priority.findOne({ guildId });
      if (!p?.priorityActive) return res.json({ active: false });
      res.json({ active: true, issuedBy: p.priorityIssuedBy, activatedAt: p.activatedAt, customMessage: p.customMessage });
    } catch { res.json({ active: false }); }
  });

  /* ══════════════════════ /strikes ══════════════════════ */
  router.get('/strikes', portalAuth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId) return res.json({ level: 0 });
      const s = await StrikeUser.findOne({ guildId, userId: req.portalUser.userId });
      res.json({ level: s?.currentStrikeLevel ?? 0 });
    } catch { res.json({ level: 0 }); }
  });

  /* ══════════════════════ /tickets ══════════════════════ */
  router.get('/tickets', portalAuth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId) return res.json([]);
      const tickets = await Ticket.find({ guildId, userId: req.portalUser.userId }).sort({ createdAt: -1 }).limit(20);
      res.json(tickets);
    } catch (err) {
      console.error('[API /tickets]', err.message);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  /* ══════════════════════ /calendar ══════════════════════ */
  router.get('/calendar', portalAuth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId) return res.json([]);
      const cal = await RoleplayCalendar.findOne({ guildId });
      if (!cal?.enabled || !cal.events?.length) return res.json([]);
      const order = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
      const sorted = [...cal.events].sort((a, b) => {
        const d = order.indexOf(a.day) - order.indexOf(b.day);
        return d !== 0 ? d : (a.time || '').localeCompare(b.time || '');
      });
      res.json(sorted);
    } catch (err) {
      console.error('[API /calendar]', err.message);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  /* ══════════════════════ /dispatch ══════════════════════ */
  router.get('/dispatch/mine', portalAuth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId) return res.json([]);
      const calls = await EmergencyCall.find({ guildId, reporterId: req.portalUser.userId })
        .sort({ timestamp: -1 }).limit(10);
      res.json(calls);
    } catch (err) {
      console.error('[API /dispatch/mine]', err.message);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  router.post('/dispatch/submit', portalAuth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId) return res.status(400).json({ error: 'Portal not configured' });
      const { issue, location, suspectsDescription, lastSeen, contact } = req.body;
      if (!issue?.trim()) return res.status(400).json({ error: 'Issue description is required' });
      if (!location?.trim()) return res.status(400).json({ error: 'Location is required' });

      const callId = `911-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
      const call = new EmergencyCall({
        guildId, callId,
        issue: issue.trim(),
        location: location.trim(),
        suspectsDescription: suspectsDescription?.trim() || null,
        lastSeen: lastSeen?.trim() || null,
        contact: contact?.trim() || req.portalUser.username,
        reporterUsername: req.portalUser.displayName || req.portalUser.username,
        reporterId: req.portalUser.userId,
        timestamp: new Date(),
        status: 'active',
      });
      await call.save();

      /* Post to dispatch channel if configured */
      try {
        const dispatchCfg = await DispatchConfig.findOne({ guildId });
        if (dispatchCfg?.enabled && dispatchCfg.dispatchChannelId) {
          const fields = [
            { name: 'Issue', value: issue.trim(), inline: false },
            { name: 'Location', value: location.trim(), inline: true },
          ];
          if (suspectsDescription?.trim()) fields.push({ name: 'Suspect Description', value: suspectsDescription.trim(), inline: false });
          if (lastSeen?.trim()) fields.push({ name: 'Last Seen', value: lastSeen.trim(), inline: true });
          if (contact?.trim()) fields.push({ name: 'Contact', value: contact.trim(), inline: true });
          await axios.post(`${DISCORD_BASE}/channels/${dispatchCfg.dispatchChannelId}/messages`, {
            embeds: [{
              color: 0xff4444,
              title: `🚨 911 Call — ${callId}`,
              description: `Submitted via **Member Portal** by **${req.portalUser.displayName || req.portalUser.username}**`,
              fields,
              footer: { text: 'RPM Portal • Respond with /duty' },
              timestamp: new Date().toISOString(),
            }],
          }, { headers: botHeaders() });
        }
      } catch { /* dispatch post failed — call still saved */ }

      res.json({ success: true, callId });
    } catch (err) {
      console.error('[API /dispatch/submit]', err.message);
      res.status(500).json({ error: 'Failed to submit call' });
    }
  });

  router.delete('/dispatch/:callId/cancel', portalAuth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      const call = await EmergencyCall.findOne({ guildId, callId: req.params.callId, reporterId: req.portalUser.userId, status: 'active' });
      if (!call) return res.status(404).json({ error: 'Call not found or already closed' });
      call.status = 'closed';
      call.closedAt = new Date();
      call.closedBy = req.portalUser.username;
      await call.save();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to cancel call' });
    }
  });

  /* ══════════════════════ /traffic-tickets ══════════════════════ */
  router.get('/traffic-tickets', portalAuth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId) return res.json([]);
      const chars = await CADCharacter.find({ guildId, userId: req.portalUser.userId });
      if (!chars.length) return res.json([]);
      const charIds = chars.map(c => c._id);
      const tickets = await TrafficTicket.find({ guildId, characterId: { $in: charIds } })
        .sort({ createdAt: -1 }).limit(30);
      const charMap = Object.fromEntries(chars.map(c => [c._id.toString(), c.characterName]));
      const result = tickets.map(t => ({ ...t.toObject(), characterName: charMap[t.characterId?.toString()] || t.characterName }));
      res.json(result);
    } catch (err) {
      console.error('[API /traffic-tickets]', err.message);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  router.post('/traffic-tickets/:ticketId/pay', portalAuth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      const ticket = await TrafficTicket.findOne({ guildId, ticketId: req.params.ticketId, paid: false });
      if (!ticket) return res.status(404).json({ error: 'Ticket not found or already paid' });

      const char = await CADCharacter.findOne({ _id: ticket.characterId, guildId, userId: req.portalUser.userId });
      if (!char) return res.status(403).json({ error: 'You do not own this character' });

      const balance = await EconomyBalance.findOne({ guildId, userId: req.portalUser.userId });
      if (!balance) return res.status(400).json({ error: 'No economy account. Use /balance in Discord first.' });
      if (balance.bank < ticket.fine) {
        const config = await EconomyConfig.findOne({ guildId });
        const cur = config?.currencySymbol || '$';
        return res.status(400).json({ error: `Not enough in bank. Fine: ${cur}${ticket.fine.toLocaleString()}` });
      }

      balance.bank -= ticket.fine;
      await balance.save();

      ticket.paid = true;
      ticket.paidAt = new Date();
      await ticket.save();

      res.json({ success: true, newBank: balance.bank });
    } catch (err) {
      console.error('[API /traffic-tickets/:id/pay]', err.message);
      res.status(500).json({ error: 'Payment failed' });
    }
  });

  /* ══════════════════════ /cad ══════════════════════ */
  router.get('/cad', portalAuth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId) return res.json([]);
      res.json(await CADCharacter.find({ guildId, userId: req.portalUser.userId }));
    } catch { res.status(500).json({ error: 'Internal error' }); }
  });

  router.post('/cad/create', portalAuth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId) return res.status(400).json({ error: 'Portal not configured' });
      const { characterName, age, gender, hairColor, eyeColor, height, occupation, address, phoneNumber, emergencyContact } = req.body;
      if (!characterName?.trim()) return res.status(400).json({ error: 'Character name is required' });
      const count = await CADCharacter.countDocuments({ guildId, userId: req.portalUser.userId });
      if (count >= 5) return res.status(400).json({ error: 'Maximum of 5 characters reached' });
      const char = new CADCharacter({
        guildId, userId: req.portalUser.userId,
        characterName: characterName.trim(),
        age: age ? parseInt(age) : null, gender: gender || null,
        hairColor: hairColor || null, eyeColor: eyeColor || null,
        height: height || null, occupation: occupation || null,
        address: address || null, phoneNumber: phoneNumber || null,
        emergencyContact: emergencyContact || null, status: 'clean',
      });
      await char.save();
      res.json(char);
    } catch { res.status(500).json({ error: 'Failed to create character' }); }
  });

  router.post('/cad/:charId/vehicle', portalAuth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      const char = await CADCharacter.findOne({ _id: req.params.charId, guildId, userId: req.portalUser.userId });
      if (!char) return res.status(404).json({ error: 'Character not found' });
      const { make, model, color, licensePlate, year } = req.body;
      if (!make || !model) return res.status(400).json({ error: 'Make and model required' });
      char.vehicles.push({ make, model, color, licensePlate: licensePlate?.toUpperCase(), year, addedAt: new Date() });
      await char.save();
      res.json(char);
    } catch { res.status(500).json({ error: 'Failed to add vehicle' }); }
  });

  router.delete('/cad/:charId', portalAuth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      const char = await CADCharacter.findOneAndDelete({ _id: req.params.charId, guildId, userId: req.portalUser.userId });
      if (!char) return res.status(404).json({ error: 'Character not found' });
      res.json({ success: true });
    } catch { res.status(500).json({ error: 'Failed to delete' }); }
  });

  /* ══════════════════════ /economy ══════════════════════ */
  router.get('/economy', portalAuth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId) return res.json({ cash: 0, bank: 0, currency: '$', inventory: [] });
      const [balance, config, inventory] = await Promise.all([
        EconomyBalance.findOne({ guildId, userId: req.portalUser.userId }),
        EconomyConfig.findOne({ guildId }),
        EconomyInventory.findOne({ guildId, userId: req.portalUser.userId }),
      ]);
      res.json({ cash: balance?.cash ?? 0, bank: balance?.bank ?? 0, currency: config?.currencySymbol ?? '$', inventory: inventory?.items ?? [] });
    } catch { res.status(500).json({ error: 'Internal error' }); }
  });

  router.get('/economy/shop', portalAuth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId) return res.json([]);
      res.json(await EconomyStore.find({ guildId }));
    } catch { res.status(500).json({ error: 'Internal error' }); }
  });

  router.post('/economy/buy', portalAuth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId) return res.status(400).json({ error: 'Portal not configured' });
      const { itemName, quantity = 1 } = req.body;
      const qty = Math.max(1, Math.min(99, parseInt(quantity) || 1));
      const item = await EconomyStore.findOne({ guildId, name: itemName });
      if (!item) return res.status(404).json({ error: 'Item not found' });
      const totalCost = item.price * qty;
      const balance = await EconomyBalance.findOne({ guildId, userId: req.portalUser.userId });
      if (!balance) return res.status(400).json({ error: 'No economy account. Use /balance in Discord first.' });
      const config = await EconomyConfig.findOne({ guildId });
      const cur = config?.currencySymbol || '$';
      if (balance.cash < totalCost) return res.status(400).json({ error: `Not enough cash. Need ${cur}${totalCost.toLocaleString()}.` });
      balance.cash -= totalCost;
      await balance.save();
      let inv = await EconomyInventory.findOne({ guildId, userId: req.portalUser.userId });
      if (!inv) inv = new EconomyInventory({ guildId, userId: req.portalUser.userId, items: [] });
      const existing = inv.items.find(i => i.itemName === itemName);
      if (existing) existing.quantity += qty; else inv.items.push({ itemName, quantity: qty });
      await inv.save();
      res.json({ success: true, newCash: balance.cash, currency: cur });
    } catch { res.status(500).json({ error: 'Purchase failed' }); }
  });

  router.get('/economy/leaderboard', portalAuth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId) return res.json({ entries: [], currency: '$' });
      const balances = await EconomyBalance.find({ guildId }).sort({ bank: -1 }).limit(10);
      const config = await EconomyConfig.findOne({ guildId });
      const entries = await Promise.all(balances.map(async (b, i) => {
        let name = 'Unknown';
        try {
          const m = await fetchGuildMember(b.userId);
          name = m?.nick || null;
          if (!name) {
            const uRes = await axios.get(`${DISCORD_BASE}/users/${b.userId}`, { headers: botHeaders() });
            name = uRes.data.global_name || uRes.data.username || 'Unknown';
          }
        } catch { /* skip */ }
        return { rank: i + 1, name: name || 'Unknown', cash: b.cash, bank: b.bank, total: b.cash + b.bank };
      }));
      res.json({ entries, currency: config?.currencySymbol || '$' });
    } catch { res.status(500).json({ error: 'Internal error' }); }
  });

  /* ══════════════════════ /rolerequest ══════════════════════ */
  router.get('/rolerequest/types', portalAuth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId) return res.json([]);
      const config = await RoleRequestConfig.findOne({ guildId });
      if (!config?.enabled) return res.json([]);
      res.json(config.roles || []);
    } catch { res.status(500).json({ error: 'Internal error' }); }
  });

  router.get('/rolerequest/approvers/:roleTypeId', portalAuth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId) return res.json([]);
      const config = await RoleRequestConfig.findOne({ guildId });
      const roleType = config?.roles?.find(r => r.id === req.params.roleTypeId);
      if (!roleType) return res.status(404).json({ error: 'Role type not found' });
      const approvers = [];
      for (const memberId of (roleType.approverMemberIds || [])) {
        try {
          const m = await fetchGuildMember(memberId);
          approvers.push({ id: memberId, name: m?.nick || m?.user?.global_name || 'Unknown' });
        } catch { /* skip */ }
      }
      if (roleType.approverRoleIds?.length) {
        try {
          const mRes = await axios.get(`${DISCORD_BASE}/guilds/${guildId}/members?limit=1000`, { headers: botHeaders() });
          for (const m of mRes.data) {
            if (m.user?.bot || approvers.find(a => a.id === m.user.id)) continue;
            if (roleType.approverRoleIds.some(rid => m.roles.includes(rid)))
              approvers.push({ id: m.user.id, name: m.nick || m.user.global_name || m.user.username });
          }
        } catch { /* skip */ }
      }
      res.json(approvers);
    } catch { res.status(500).json({ error: 'Internal error' }); }
  });

  router.post('/rolerequest/submit', portalAuth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId) return res.status(400).json({ error: 'Portal not configured' });
      const { roleTypeId, approverId } = req.body;
      if (!roleTypeId || !approverId) return res.status(400).json({ error: 'Role type and approver required' });
      const config = await RoleRequestConfig.findOne({ guildId });
      const roleType = config?.roles?.find(r => r.id === roleTypeId);
      if (!roleType) return res.status(404).json({ error: 'Role type not found' });
      const approverMember = await fetchGuildMember(approverId);
      if (!approverMember) return res.status(400).json({ error: 'Approver not found' });
      let authorized = roleType.approverMemberIds?.includes(approverId);
      if (!authorized) authorized = roleType.approverRoleIds?.some(rid => approverMember.roles?.includes(rid));
      if (!authorized) return res.status(403).json({ error: 'That member is not an authorized approver' });
      const requestId = `ROLEREQ-${Date.now()}`;
      const approverUser = approverMember.user || {};
      const newRequest = new RoleRequest({
        guildId, requestId,
        requesterId: req.portalUser.userId, requesterUsername: req.portalUser.username,
        roleId: roleType.roleId, roleName: roleType.roleName,
        approverId, approverUsername: approverMember.nick || approverUser.global_name || approverUser.username || approverId,
        timestamp: new Date(),
      });
      await newRequest.save();
      try {
        const dmRes = await axios.post(`${DISCORD_BASE}/users/@me/channels`, { recipient_id: approverId }, { headers: botHeaders() });
        await axios.post(`${DISCORD_BASE}/channels/${dmRes.data.id}/messages`, {
          embeds: [{
            color: 0x4f7ef7, title: 'Role Request',
            description: `**${req.portalUser.username}** requested **${roleType.roleName}** via the Member Portal.`,
            fields: [{ name: 'Request ID', value: requestId }],
            footer: { text: 'RPM Portal' },
          }],
        }, { headers: botHeaders() });
      } catch { /* DM failed */ }
      res.json({ success: true, requestId });
    } catch { res.status(500).json({ error: 'Failed to submit request' }); }
  });

  router.get('/rolerequest/mine', portalAuth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId) return res.json([]);
      res.json(await RoleRequest.find({ guildId, requesterId: req.portalUser.userId }).sort({ timestamp: -1 }).limit(10));
    } catch { res.status(500).json({ error: 'Internal error' }); }
  });

  /* ══════════════════════ LEO ══════════════════════ */
  router.get('/leo/search', portalAuth, requireLeo, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      const { type, query } = req.query;
      if (!query?.trim()) return res.status(400).json({ error: 'Query required' });
      if (type === 'plate') {
        const chars = await CADCharacter.find({ guildId, 'vehicles.licensePlate': { $regex: query.trim(), $options: 'i' } }).limit(10);
        return res.json({ type: 'plate', results: chars });
      }
      if (type === 'character') {
        const chars = await CADCharacter.find({ guildId, characterName: { $regex: query.trim(), $options: 'i' } }).limit(10);
        return res.json({ type: 'character', results: chars });
      }
      res.status(400).json({ error: 'type must be plate or character' });
    } catch { res.status(500).json({ error: 'Internal error' }); }
  });

  router.get('/leo/bolos', portalAuth, requireLeo, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      res.json(await BOLO.find({ guildId, active: true }).sort({ createdAt: -1 }).limit(20));
    } catch { res.status(500).json({ error: 'Internal error' }); }
  });

  router.get('/leo/calls', portalAuth, requireLeo, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      res.json(await EmergencyCall.find({ guildId, status: 'active' }).sort({ timestamp: -1 }).limit(20));
    } catch { res.status(500).json({ error: 'Internal error' }); }
  });

  router.get('/leo/officers', portalAuth, requireLeo, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId) return res.json([]);
      const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000);
      const officers = await OfficerStatus.find({ guildId, updatedAt: { $gte: cutoff } }).sort({ updatedAt: -1 });
      res.json(officers);
    } catch { res.status(500).json({ error: 'Internal error' }); }
  });

  return router;
}
