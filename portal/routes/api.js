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

const TEN_LABELS = {
  '10-6':  'Busy',
  '10-7':  'Out of Service',
  '10-8':  'Available',
  '10-10': 'Off Duty',
  '10-11': 'Traffic Stop',
  '10-15': 'Prisoner in Custody',
  '10-50': 'Accident',
  '10-76': 'En Route',
  '10-78': 'Need Assistance',
  '10-80': 'Pursuit',
  '10-97': 'On Scene',
  '10-99': 'Officer Down',
};

const TEN_COLORS = {
  '10-8':  0x3dd68c,
  '10-6':  0xf5a623,
  '10-97': 0xf5a623,
  '10-11': 0xf5a623,
  '10-50': 0xf5a623,
  '10-76': 0x4f7ef7,
  '10-78': 0xf75f5f,
  '10-80': 0xf75f5f,
  '10-15': 0xf75f5f,
  '10-99': 0xff0000,
  '10-7':  0x50505f,
  '10-10': 0x50505f,
};

const TEN_ICONS = {
  '10-8':  '🟢',
  '10-6':  '🟡',
  '10-97': '🟠',
  '10-11': '🟠',
  '10-50': '🟠',
  '10-76': '🔵',
  '10-78': '🔴',
  '10-80': '🔴',
  '10-15': '🔴',
  '10-99': '🆘',
  '10-7':  '⚫',
  '10-10': '⚫',
};

async function rebuildStatusBoard(guildId, dispatchCfg) {
  try {
    if (!dispatchCfg?.statusBoardChannelId) return;

    const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const officers = await OfficerStatus.find({ guildId, updatedAt: { $gte: cutoff } }).sort({ updatedAt: -1 });

    const activeOfficers = officers.filter(o => o.tenCode !== '10-10' && o.tenCode !== '10-7');

    let embed;
    if (!officers.length) {
      embed = {
        color: 0x2e2e36,
        title: '🚔  Officer Status Board',
        description: '*No officers currently on duty.*',
        footer: { text: 'RPM Portal • Auto-updates on status change' },
        timestamp: new Date().toISOString(),
      };
    } else {
      const fields = officers.map(o => {
        const icon = TEN_ICONS[o.tenCode] || '⚪';
        const label = TEN_LABELS[o.tenCode] || o.tenCode;
        let value = `${icon} **${o.tenCode}** — ${label}`;
        if (o.location) value += `\n📍 ${o.location}`;
        if (o.subject) value += `\n📋 ${o.subject}`;
        const mins = Math.floor((Date.now() - new Date(o.updatedAt).getTime()) / 60000);
        value += `\n*Updated ${mins < 1 ? 'just now' : `${mins}m ago`}*`;
        return { name: o.username, value: `<@${o.userId}>\n` + value, inline: true };
      });

      const dominantCode = activeOfficers.find(o => o.tenCode === '10-99')?.tenCode
        || activeOfficers.find(o => o.tenCode === '10-15')?.tenCode
        || activeOfficers[0]?.tenCode
        || '10-10';

      embed = {
        color: TEN_COLORS[dominantCode] ?? 0x4f7ef7,
        title: '🚔  Officer Status Board',
        description: `**${activeOfficers.length}** officer${activeOfficers.length !== 1 ? 's' : ''} active  •  **${officers.length}** total on shift`,
        fields,
        footer: { text: 'RPM Portal • Auto-updates on status change' },
        timestamp: new Date().toISOString(),
      };
    }

    const channelId = dispatchCfg.statusBoardChannelId;
    let messageId = dispatchCfg.statusBoardMessageId;

    if (messageId) {
      try {
        let components = [];
        try {
          const existingRes = await axios.get(
            `${DISCORD_BASE}/channels/${channelId}/messages/${messageId}`,
            { headers: botHeaders() }
          );
          components = existingRes.data.components || [];
        } catch { /* preserve nothing if fetch fails */ }

        await axios.patch(
          `${DISCORD_BASE}/channels/${channelId}/messages/${messageId}`,
          { embeds: [embed], components },
          { headers: botHeaders() }
        );
        return;
      } catch {
        messageId = null;
      }
    }

    const posted = await axios.post(
      `${DISCORD_BASE}/channels/${channelId}/messages`,
      { embeds: [embed] },
      { headers: botHeaders() }
    );
    await DispatchConfig.findOneAndUpdate({ guildId }, { statusBoardMessageId: posted.data.id });
  } catch (err) {
    console.error('[rebuildStatusBoard]', err.message);
  }
}

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
      if (!guildId) return res.json({ active: false, cooldown: false });
      const p = await Priority.findOne({ guildId });
      if (!p) return res.json({ active: false, cooldown: false });
      const now = new Date();
      const cooldownActive = !!(p.cooldownEndsAt && p.cooldownEndsAt > now);
      res.json({
        active: !!p.priorityActive,
        issuedBy: p.priorityIssuedBy,
        activatedAt: p.activatedAt,
        expiresAt: p.expiresAt,
        customMessage: p.customMessage,
        hostUserId: p.hostUserId,
        cooldown: cooldownActive,
        cooldownEndsAt: cooldownActive ? p.cooldownEndsAt : null,
        cooldownIssuedBy: cooldownActive ? p.cooldownIssuedBy : null,
        cooldownMinutes: p.cooldownMinutes,
      });
    } catch { res.json({ active: false, cooldown: false }); }
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
      const { characterName, age, gender, hairColor, eyeColor, height, occupation, address, phoneNumber, emergencyContact, socialSecurityNumber, driversLicense, driverLicenseStatus } = req.body;
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
        emergencyContact: emergencyContact || null,
        socialSecurityNumber: socialSecurityNumber || null,
        driversLicense: driversLicense || null,
        driverLicenseStatus: ['valid', 'invalid'].includes(driverLicenseStatus) ? driverLicenseStatus : 'valid',
        status: 'clean',
      });
      await char.save();
      res.json(char);
    } catch { res.status(500).json({ error: 'Failed to create character' }); }
  });

  router.post('/cad/:charId/gun', portalAuth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      const char = await CADCharacter.findOne({ _id: req.params.charId, guildId, userId: req.portalUser.userId });
      if (!char) return res.status(404).json({ error: 'Character not found' });
      const { name, serialNumber } = req.body;
      if (!name?.trim()) return res.status(400).json({ error: 'Firearm name required' });
      char.guns.push({ name: name.trim(), serialNumber: serialNumber?.trim() || '', addedAt: new Date() });
      await char.save();
      res.json(char);
    } catch { res.status(500).json({ error: 'Failed to register firearm' }); }
  });

  router.delete('/cad/:charId/gun/:index', portalAuth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      const char = await CADCharacter.findOne({ _id: req.params.charId, guildId, userId: req.portalUser.userId });
      if (!char) return res.status(404).json({ error: 'Character not found' });
      const idx = parseInt(req.params.index);
      if (isNaN(idx) || idx < 0 || idx >= char.guns.length) return res.status(400).json({ error: 'Invalid firearm index' });
      char.guns.splice(idx, 1);
      await char.save();
      res.json(char);
    } catch { res.status(500).json({ error: 'Failed to remove firearm' }); }
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

  router.post('/economy/deposit', portalAuth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId) return res.status(400).json({ error: 'Portal not configured' });
      const rawAmt = String(req.body.amount || '').trim().toLowerCase();
      const balance = await EconomyBalance.findOne({ guildId, userId: req.portalUser.userId });
      if (!balance) return res.status(400).json({ error: 'No economy account. Use /balance in Discord first.' });
      const amount = rawAmt === 'all' ? balance.cash : parseInt(rawAmt, 10);
      if (!amount || amount <= 0) return res.status(400).json({ error: 'Enter a valid amount.' });
      if (balance.cash < amount) return res.status(400).json({ error: 'Not enough cash.' });
      balance.cash -= amount;
      balance.bank += amount;
      await balance.save();
      res.json({ success: true, cash: balance.cash, bank: balance.bank });
    } catch { res.status(500).json({ error: 'Internal error' }); }
  });

  router.post('/economy/withdraw', portalAuth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId) return res.status(400).json({ error: 'Portal not configured' });
      const rawAmt = String(req.body.amount || '').trim().toLowerCase();
      const balance = await EconomyBalance.findOne({ guildId, userId: req.portalUser.userId });
      if (!balance) return res.status(400).json({ error: 'No economy account. Use /balance in Discord first.' });
      const amount = rawAmt === 'all' ? balance.bank : parseInt(rawAmt, 10);
      if (!amount || amount <= 0) return res.status(400).json({ error: 'Enter a valid amount.' });
      if (balance.bank < amount) return res.status(400).json({ error: 'Not enough in bank.' });
      balance.bank -= amount;
      balance.cash += amount;
      await balance.save();
      res.json({ success: true, cash: balance.cash, bank: balance.bank });
    } catch { res.status(500).json({ error: 'Internal error' }); }
  });

  const workCooldowns = new Map();
  router.post('/economy/work', portalAuth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId) return res.status(400).json({ error: 'Portal not configured' });
      const cooldownKey = `${guildId}:${req.portalUser.userId}`;
      const config = await EconomyConfig.findOne({ guildId });
      if (config && !config.work?.enabled) return res.status(400).json({ error: 'Work is disabled on this server.' });
      const cdMinutes = config?.work?.cooldown ?? 60;
      const lastWork = workCooldowns.get(cooldownKey);
      if (lastWork) {
        const elapsed = Date.now() - lastWork;
        const remaining = cdMinutes * 60 * 1000 - elapsed;
        if (remaining > 0) {
          const mins = Math.ceil(remaining / 60000);
          return res.status(429).json({ error: `On cooldown. Try again in ${mins} minute${mins !== 1 ? 's' : ''}.` });
        }
      }
      const min = config?.work?.minPayout ?? 100;
      const max = config?.work?.maxPayout ?? 500;
      const earned = Math.floor(Math.random() * (max - min + 1)) + min;
      let balance = await EconomyBalance.findOne({ guildId, userId: req.portalUser.userId });
      if (!balance) return res.status(400).json({ error: 'No economy account. Use /balance in Discord first.' });
      balance.cash += earned;
      await balance.save();
      workCooldowns.set(cooldownKey, Date.now());
      res.json({ success: true, earned, cash: balance.cash, bank: balance.bank });
    } catch { res.status(500).json({ error: 'Internal error' }); }
  });

  router.post('/economy/sell', portalAuth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId) return res.status(400).json({ error: 'Portal not configured' });
      const { itemName, quantity = 1 } = req.body;
      const qty = Math.max(1, parseInt(quantity) || 1);
      const inv = await EconomyInventory.findOne({ guildId, userId: req.portalUser.userId });
      const entry = inv?.items?.find(i => i.itemName === itemName);
      if (!entry || entry.quantity < qty) return res.status(400).json({ error: 'Not enough of that item.' });
      const storeItem = await EconomyStore.findOne({ guildId, name: itemName });
      const sellPrice = storeItem ? Math.floor(storeItem.price * 0.5) * qty : 0;
      entry.quantity -= qty;
      if (entry.quantity <= 0) inv.items = inv.items.filter(i => i.itemName !== itemName);
      await inv.save();
      const config = await EconomyConfig.findOne({ guildId });
      const cur = config?.currencySymbol || '$';
      if (sellPrice > 0) {
        const balance = await EconomyBalance.findOne({ guildId, userId: req.portalUser.userId });
        if (balance) { balance.cash += sellPrice; await balance.save(); }
      }
      res.json({ success: true, sold: qty, refund: sellPrice, currency: cur });
    } catch { res.status(500).json({ error: 'Internal error' }); }
  });

  router.post('/economy/use', portalAuth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId) return res.status(400).json({ error: 'Portal not configured' });
      const { itemName } = req.body;
      const inv = await EconomyInventory.findOne({ guildId, userId: req.portalUser.userId });
      const entry = inv?.items?.find(i => i.itemName === itemName);
      if (!entry || entry.quantity < 1) return res.status(400).json({ error: 'You do not have that item.' });
      entry.quantity -= 1;
      if (entry.quantity <= 0) inv.items = inv.items.filter(i => i.itemName !== itemName);
      await inv.save();
      res.json({ success: true, itemName });
    } catch { res.status(500).json({ error: 'Internal error' }); }
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

      let chars = [];
      if (type === 'plate') {
        chars = await CADCharacter.find({ guildId, 'vehicles.licensePlate': { $regex: query.trim(), $options: 'i' } }).limit(10);
      } else if (type === 'character') {
        chars = await CADCharacter.find({ guildId, characterName: { $regex: query.trim(), $options: 'i' } }).limit(10);
      } else {
        return res.status(400).json({ error: 'type must be plate or character' });
      }

      const charIds = chars.map(c => c._id);
      const [bolos, tickets] = await Promise.all([
        BOLO.find({ guildId, characterId: { $in: charIds }, active: true }).select('characterId boloId reason description issuedBy createdAt').lean(),
        TrafficTicket.find({ guildId, characterId: { $in: charIds } }).sort({ createdAt: -1 }).select('characterId ticketId violation description fine paid createdAt issuedBy').lean(),
      ]);

      const bolosByChar = {};
      for (const b of bolos) {
        const key = b.characterId.toString();
        if (!bolosByChar[key]) bolosByChar[key] = [];
        bolosByChar[key].push(b);
      }
      const ticketsByChar = {};
      for (const t of tickets) {
        const key = t.characterId.toString();
        if (!ticketsByChar[key]) ticketsByChar[key] = [];
        ticketsByChar[key].push(t);
      }

      const results = chars.map(c => ({
        ...c.toObject(),
        activeBolos: bolosByChar[c._id.toString()] || [],
        trafficTickets: ticketsByChar[c._id.toString()] || [],
      }));

      res.json({ type, results });
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

  router.post('/leo/calls/:callId/respond', portalAuth, requireLeo, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      const call = await EmergencyCall.findOne({ guildId, callId: req.params.callId, status: 'active' });
      if (!call) return res.status(404).json({ error: 'Call not found or already closed' });
      if (call.respondingLeoId) return res.status(400).json({ error: 'Call already has a primary responder' });

      const displayName = req.portalUser.displayName || req.portalUser.username;
      call.respondingLeoId = req.portalUser.userId;
      call.respondingLeoUsername = displayName;
      await call.save();

      const dispatchCfg = await DispatchConfig.findOne({ guildId });

      await OfficerStatus.findOneAndUpdate(
        { guildId, userId: req.portalUser.userId },
        { guildId, userId: req.portalUser.userId, username: displayName, tenCode: '10-76', location: call.location || null, subject: `Responding to ${call.callId}`, rawCall: null, updatedAt: new Date() },
        { upsert: true, new: true }
      );

      if (dispatchCfg?.dispatchChannelId) {
        await axios.post(`${DISCORD_BASE}/channels/${dispatchCfg.dispatchChannelId}/messages`, {
          embeds: [{
            color: 0x4f7ef7,
            title: `Officer Responding — ${call.callId}`,
            description: `**${displayName}** is responding via the Member Portal.\n**Status:** 10-76 En Route${call.location ? `\n**Location:** ${call.location}` : ''}`,
            footer: { text: 'RPM Portal • Status auto-set to 10-76' },
            timestamp: new Date().toISOString(),
          }],
        }, { headers: botHeaders() }).catch(() => {});
      }

      await rebuildStatusBoard(guildId, dispatchCfg);
      res.json({ success: true, call });
    } catch (err) {
      console.error('[API POST /leo/calls/respond]', err.message);
      res.status(500).json({ error: 'Failed to respond to call' });
    }
  });

  router.post('/leo/calls/:callId/attach', portalAuth, requireLeo, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      const call = await EmergencyCall.findOne({ guildId, callId: req.params.callId, status: 'active' });
      if (!call) return res.status(404).json({ error: 'Call not found or already closed' });
      if ((call.attachedLeoIds || []).includes(req.portalUser.userId))
        return res.status(400).json({ error: 'You are already attached to this call' });

      const displayName = req.portalUser.displayName || req.portalUser.username;
      call.attachedLeoIds = [...(call.attachedLeoIds || []), req.portalUser.userId];
      await call.save();

      const dispatchCfg = await DispatchConfig.findOne({ guildId });

      await OfficerStatus.findOneAndUpdate(
        { guildId, userId: req.portalUser.userId },
        { guildId, userId: req.portalUser.userId, username: displayName, tenCode: '10-97', location: call.location || null, subject: `Attached to ${call.callId}`, rawCall: null, updatedAt: new Date() },
        { upsert: true, new: true }
      );

      await rebuildStatusBoard(guildId, dispatchCfg);
      res.json({ success: true, call });
    } catch (err) {
      console.error('[API POST /leo/calls/attach]', err.message);
      res.status(500).json({ error: 'Failed to attach to call' });
    }
  });

  router.delete('/leo/calls/:callId', portalAuth, requireLeo, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      const call = await EmergencyCall.findOne({ guildId, callId: req.params.callId, status: 'active' });
      if (!call) return res.status(404).json({ error: 'Call not found or already closed' });

      const userId = req.portalUser.userId;
      const isResponder = call.respondingLeoId === userId;
      const isAttached = (call.attachedLeoIds || []).includes(userId);

      const freshRoles = await refreshMemberRoles(userId);
      const cadConfig = await CADConfig.findOne({ guildId });
      const isStaff = cadConfig?.staffRoleIds?.some(id => (freshRoles || []).includes(id));

      if (!isResponder && !isAttached && !isStaff)
        return res.status(403).json({ error: 'Only the responding or attached officer (or staff) can dismiss this call' });

      call.status = 'closed';
      call.closedAt = new Date();
      call.closedBy = req.portalUser.displayName || req.portalUser.username;
      await call.save();

      const dispatchCfg = await DispatchConfig.findOne({ guildId });
      await rebuildStatusBoard(guildId, dispatchCfg);
      res.json({ success: true });
    } catch (err) {
      console.error('[API DELETE /leo/calls/:callId]', err.message);
      res.status(500).json({ error: 'Failed to dismiss call' });
    }
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

  router.get('/leo/mystatus', portalAuth, requireLeo, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId) return res.json(null);
      const status = await OfficerStatus.findOne({ guildId, userId: req.portalUser.userId });
      res.json(status || null);
    } catch { res.status(500).json({ error: 'Internal error' }); }
  });

  router.post('/leo/status', portalAuth, requireLeo, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId) return res.status(400).json({ error: 'Portal not configured' });
      const { tenCode, location, subject } = req.body;
      if (!tenCode?.trim()) return res.status(400).json({ error: 'Ten-code is required' });

      const displayName = req.portalUser.displayName || req.portalUser.username;

      const updated = await OfficerStatus.findOneAndUpdate(
        { guildId, userId: req.portalUser.userId },
        {
          guildId,
          userId: req.portalUser.userId,
          username: displayName,
          tenCode: tenCode.trim(),
          location: location?.trim() || null,
          subject: subject?.trim() || null,
          rawCall: null,
          updatedAt: new Date(),
        },
        { upsert: true, new: true }
      );

      const dispatchCfg = await DispatchConfig.findOne({ guildId });
      await rebuildStatusBoard(guildId, dispatchCfg);

      res.json({ success: true, status: updated });
    } catch (err) {
      console.error('[API POST /leo/status]', err.message);
      res.status(500).json({ error: 'Failed to update status' });
    }
  });

  router.delete('/leo/status', portalAuth, requireLeo, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId) return res.status(400).json({ error: 'Portal not configured' });
      await OfficerStatus.findOneAndDelete({ guildId, userId: req.portalUser.userId });
      const dispatchCfg = await DispatchConfig.findOne({ guildId });
      await rebuildStatusBoard(guildId, dispatchCfg);
      res.json({ success: true });
    } catch { res.status(500).json({ error: 'Internal error' }); }
  });

  router.post('/leo/panic', portalAuth, requireLeo, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId) return res.status(400).json({ error: 'Portal not configured' });
      const { location } = req.body;
      const displayName = req.portalUser.displayName || req.portalUser.username;

      await OfficerStatus.findOneAndUpdate(
        { guildId, userId: req.portalUser.userId },
        {
          guildId,
          userId: req.portalUser.userId,
          username: displayName,
          tenCode: '10-99',
          location: location?.trim() || null,
          subject: 'PANIC — Officer needs immediate assistance',
          rawCall: null,
          updatedAt: new Date(),
        },
        { upsert: true, new: true }
      );

      try {
        const dispatchCfg = await DispatchConfig.findOne({ guildId });
        if (dispatchCfg?.enabled) {
          const panicEmbed = {
            color: 0xff0000,
            title: '10-99 — OFFICER NEEDS IMMEDIATE ASSISTANCE',
            description: `**${displayName}** has activated their panic button via the Member Portal.\n-# All units respond immediately.`,
            fields: [
              { name: 'Officer', value: displayName, inline: true },
              ...(location?.trim() ? [{ name: 'Last Known Location', value: location.trim(), inline: true }] : []),
              { name: 'Code', value: '10-99 — Emergency', inline: true },
            ],
            footer: { text: 'RPM Portal • ALL UNITS RESPOND' },
            timestamp: new Date().toISOString(),
          };
          if (dispatchCfg.dispatchChannelId) {
            await axios.post(`${DISCORD_BASE}/channels/${dispatchCfg.dispatchChannelId}/messages`, { embeds: [panicEmbed] }, { headers: botHeaders() }).catch(() => {});
          }
          await rebuildStatusBoard(guildId, dispatchCfg);
        }
      } catch { /* embed post failed — status still saved */ }

      const botUrl = process.env.BOT_INTERNAL_URL;
      const secret = process.env.PORTAL_INTERNAL_SECRET;
      if (botUrl) {
        axios.post(
          `${botUrl}/api/internal/panic`,
          { guildId, officerName: displayName, location: location?.trim() || null },
          { headers: secret ? { 'x-internal-secret': secret } : {}, timeout: 8000 }
        ).catch(err => console.error('[Portal panic → bot]', err.message));
      }

      res.json({ success: true });
    } catch (err) {
      console.error('[API POST /leo/panic]', err.message);
      res.status(500).json({ error: 'Failed to trigger panic' });
    }
  });

  router.post('/leo/bolo', portalAuth, requireLeo, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      const { characterId, reason, description } = req.body;
      if (!characterId || !reason?.trim()) return res.status(400).json({ error: 'characterId and reason are required' });
      const char = await CADCharacter.findOne({ _id: characterId, guildId });
      if (!char) return res.status(404).json({ error: 'Character not found' });
      const boloId = `BOLO-${Date.now().toString(36).toUpperCase()}`;
      const displayName = req.portalUser.displayName || req.portalUser.username;
      const bolo = new BOLO({
        guildId, boloId,
        characterId: char._id,
        characterName: char.characterName,
        reason: reason.trim(),
        description: description?.trim() || '',
        issuedBy: displayName,
        active: true,
      });
      await bolo.save();
      res.json({ success: true, bolo });
    } catch (err) {
      console.error('[API POST /leo/bolo]', err.message);
      res.status(500).json({ error: 'Failed to create BOLO' });
    }
  });

  router.delete('/leo/bolo/:boloId', portalAuth, requireLeo, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      const bolo = await BOLO.findOneAndUpdate(
        { guildId, boloId: req.params.boloId },
        { active: false },
        { new: true }
      );
      if (!bolo) return res.status(404).json({ error: 'BOLO not found' });
      res.json({ success: true });
    } catch (err) {
      console.error('[API DELETE /leo/bolo]', err.message);
      res.status(500).json({ error: 'Failed to revoke BOLO' });
    }
  });

  router.post('/leo/ticket', portalAuth, requireLeo, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      const { characterId, violation, description, fine } = req.body;
      if (!characterId || !violation?.trim()) return res.status(400).json({ error: 'characterId and violation are required' });
      const char = await CADCharacter.findOne({ _id: characterId, guildId });
      if (!char) return res.status(404).json({ error: 'Character not found' });
      const ticketId = `TKT-${Date.now().toString(36).toUpperCase()}`;
      const displayName = req.portalUser.displayName || req.portalUser.username;
      const ticket = new TrafficTicket({
        guildId, ticketId,
        characterId: char._id,
        characterName: char.characterName,
        issuedBy: displayName,
        violation: violation.trim(),
        description: description?.trim() || '',
        fine: fine ? Math.max(0, parseInt(fine) || 0) : 0,
        paid: false,
      });
      await ticket.save();
      res.json({ success: true, ticket });
    } catch (err) {
      console.error('[API POST /leo/ticket]', err.message);
      res.status(500).json({ error: 'Failed to issue ticket' });
    }
  });

  return router;
}
