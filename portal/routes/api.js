import { Router } from 'express';
import { portalAuth, fetchGuildMember } from './auth.js';
import mongoose from 'mongoose';
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
import Ticket from '../../src/models/Ticket.js';
import TicketConfig from '../../src/models/TicketConfig.js';
import Priority from '../../src/models/Priority.js';
import RoleplayCalendar from '../../src/models/RoleplayCalendar.js';
import { StrikeUser } from '../../src/models/Strike.js';

const GUILD_ID = () => process.env.PORTAL_GUILD_ID;

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

export function createApiRouter() {
  const router = Router();

  // ── /me ──────────────────────────────────────────────────────────────────
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
        const guildRes = await axios.get(
          `https://discord.com/api/v10/guilds/${guildId}`,
          { headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` } }
        );
        serverName = guildRes.data.name || serverName;
        if (guildRes.data.icon) {
          serverIcon = `https://cdn.discordapp.com/icons/${guildId}/${guildRes.data.icon}.png`;
        }
      } catch { /* use defaults */ }

      let roleDetails = [];
      try {
        const rolesRes = await axios.get(
          `https://discord.com/api/v10/guilds/${guildId}/roles`,
          { headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` } }
        );
        roleDetails = rolesRes.data
          .filter(r => freshRoles.includes(r.id) && r.name !== '@everyone')
          .sort((a, b) => b.position - a.position)
          .slice(0, 8)
          .map(r => ({
            id: r.id,
            name: r.name,
            color: r.color ? `#${r.color.toString(16).padStart(6, '0')}` : null,
          }));
      } catch { /* skip */ }

      res.json({ userId, username, displayName, isLeo, serverName, serverIcon, roles: roleDetails,
        avatar: avatar
          ? `https://cdn.discordapp.com/avatars/${userId}/${avatar}.png?size=128`
          : `https://cdn.discordapp.com/embed/avatars/${parseInt(userId) % 5}.png`,
      });
    } catch (err) {
      console.error('[PORTAL API /me]', err.message);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  // ── /priority ─────────────────────────────────────────────────────────────
  router.get('/priority', portalAuth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId) return res.json({ active: false });
      const priority = await Priority.findOne({ guildId });
      if (!priority?.priorityActive) return res.json({ active: false });
      res.json({
        active: true,
        issuedBy: priority.priorityIssuedBy || null,
        activatedAt: priority.activatedAt || null,
        customMessage: priority.customMessage || null,
      });
    } catch (err) {
      res.json({ active: false });
    }
  });

  // ── /strikes ──────────────────────────────────────────────────────────────
  router.get('/strikes', portalAuth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId) return res.json({ level: 0 });
      const strike = await StrikeUser.findOne({ guildId, userId: req.portalUser.userId });
      res.json({ level: strike?.currentStrikeLevel ?? 0 });
    } catch (err) {
      res.json({ level: 0 });
    }
  });

  // ── /tickets ──────────────────────────────────────────────────────────────
  router.get('/tickets', portalAuth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId) return res.json([]);
      const tickets = await Ticket.find({ guildId, userId: req.portalUser.userId })
        .sort({ createdAt: -1 }).limit(20);
      res.json(tickets);
    } catch (err) {
      console.error('[PORTAL API /tickets]', err.message);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  // ── /calendar ─────────────────────────────────────────────────────────────
  router.get('/calendar', portalAuth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId) return res.json([]);
      const cal = await RoleplayCalendar.findOne({ guildId });
      if (!cal?.enabled || !cal.events?.length) return res.json([]);
      const dayOrder = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
      const sorted = [...cal.events].sort((a, b) => {
        const ai = dayOrder.indexOf(a.day);
        const bi = dayOrder.indexOf(b.day);
        if (ai !== bi) return ai - bi;
        return (a.time || '').localeCompare(b.time || '');
      });
      res.json(sorted);
    } catch (err) {
      console.error('[PORTAL API /calendar]', err.message);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  // ── /cad ──────────────────────────────────────────────────────────────────
  router.get('/cad', portalAuth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId) return res.json([]);
      const chars = await CADCharacter.find({ guildId, userId: req.portalUser.userId });
      res.json(chars);
    } catch (err) {
      res.status(500).json({ error: 'Internal error' });
    }
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
    } catch (err) {
      res.status(500).json({ error: 'Failed to create character' });
    }
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
    } catch (err) {
      res.status(500).json({ error: 'Failed to add vehicle' });
    }
  });

  router.delete('/cad/:charId', portalAuth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      const char = await CADCharacter.findOneAndDelete({ _id: req.params.charId, guildId, userId: req.portalUser.userId });
      if (!char) return res.status(404).json({ error: 'Character not found' });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete character' });
    }
  });

  // ── /economy ──────────────────────────────────────────────────────────────
  router.get('/economy', portalAuth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId) return res.json({ cash: 0, bank: 0, currency: '$', inventory: [] });
      const [balance, config, inventory] = await Promise.all([
        EconomyBalance.findOne({ guildId, userId: req.portalUser.userId }),
        EconomyConfig.findOne({ guildId }),
        EconomyInventory.findOne({ guildId, userId: req.portalUser.userId }),
      ]);
      res.json({
        cash: balance?.cash ?? 0,
        bank: balance?.bank ?? 0,
        currency: config?.currencySymbol ?? '$',
        inventory: inventory?.items ?? [],
      });
    } catch (err) {
      res.status(500).json({ error: 'Internal error' });
    }
  });

  router.get('/economy/shop', portalAuth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId) return res.json([]);
      const items = await EconomyStore.find({ guildId });
      res.json(items);
    } catch (err) {
      res.status(500).json({ error: 'Internal error' });
    }
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
      if (balance.cash < totalCost) {
        return res.status(400).json({ error: `Not enough cash. Need ${config?.currencySymbol || '$'}${totalCost.toLocaleString()}.` });
      }
      balance.cash -= totalCost;
      await balance.save();
      let inv = await EconomyInventory.findOne({ guildId, userId: req.portalUser.userId });
      if (!inv) inv = new EconomyInventory({ guildId, userId: req.portalUser.userId, items: [] });
      const existing = inv.items.find(i => i.itemName === itemName);
      if (existing) existing.quantity += qty;
      else inv.items.push({ itemName, quantity: qty });
      await inv.save();
      res.json({ success: true, newCash: balance.cash, currency: config?.currencySymbol || '$' });
    } catch (err) {
      res.status(500).json({ error: 'Purchase failed' });
    }
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
            const uRes = await axios.get(`https://discord.com/api/v10/users/${b.userId}`, {
              headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
            });
            name = uRes.data.global_name || uRes.data.username || 'Unknown';
          }
        } catch { /* skip */ }
        return { rank: i + 1, name: name || 'Unknown', cash: b.cash, bank: b.bank, total: b.cash + b.bank };
      }));
      res.json({ entries, currency: config?.currencySymbol || '$' });
    } catch (err) {
      res.status(500).json({ error: 'Internal error' });
    }
  });

  // ── /rolerequest ──────────────────────────────────────────────────────────
  router.get('/rolerequest/types', portalAuth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId) return res.json([]);
      const config = await RoleRequestConfig.findOne({ guildId });
      if (!config?.enabled) return res.json([]);
      res.json(config.roles || []);
    } catch (err) {
      res.status(500).json({ error: 'Internal error' });
    }
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
      if (roleType.approverRoleIds?.length > 0) {
        try {
          const membersRes = await axios.get(`https://discord.com/api/v10/guilds/${guildId}/members?limit=1000`, {
            headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` }
          });
          for (const m of membersRes.data) {
            if (m.user?.bot || approvers.find(a => a.id === m.user.id)) continue;
            if (roleType.approverRoleIds.some(rid => m.roles.includes(rid))) {
              approvers.push({ id: m.user.id, name: m.nick || m.user.global_name || m.user.username });
            }
          }
        } catch { /* skip */ }
      }
      res.json(approvers);
    } catch (err) {
      res.status(500).json({ error: 'Internal error' });
    }
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
        const dmRes = await axios.post('https://discord.com/api/v10/users/@me/channels',
          { recipient_id: approverId },
          { headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, 'Content-Type': 'application/json' } }
        );
        await axios.post(`https://discord.com/api/v10/channels/${dmRes.data.id}/messages`, {
          embeds: [{ color: 0x4f7ef7, title: 'Role Request', description: `**${req.portalUser.username}** requested **${roleType.roleName}** via the Member Portal.`,
            fields: [{ name: 'Request ID', value: requestId }], footer: { text: 'RPM Portal' } }],
        }, { headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, 'Content-Type': 'application/json' } });
      } catch { /* DM failed — request still saved */ }
      res.json({ success: true, requestId });
    } catch (err) {
      res.status(500).json({ error: 'Failed to submit request' });
    }
  });

  router.get('/rolerequest/mine', portalAuth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId) return res.json([]);
      const requests = await RoleRequest.find({ guildId, requesterId: req.portalUser.userId }).sort({ timestamp: -1 }).limit(10);
      res.json(requests);
    } catch (err) {
      res.status(500).json({ error: 'Internal error' });
    }
  });

  // ── LEO ───────────────────────────────────────────────────────────────────
  async function requireLeo(req, res, next) {
    const guildId = GUILD_ID();
    if (!guildId) return res.status(403).json({ error: 'Not configured' });
    const freshRoles = await refreshMemberRoles(req.portalUser.userId);
    if (!freshRoles) return res.status(403).json({ error: 'Could not verify roles' });
    const allowed = await getLeoStatus(freshRoles, guildId);
    if (!allowed) return res.status(403).json({ error: 'LEO access required' });
    next();
  }

  router.get('/leo/search', portalAuth, requireLeo, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      const { type, query } = req.query;
      if (!query?.trim()) return res.status(400).json({ error: 'Query required' });
      if (type === 'plate') {
        const chars = await CADCharacter.find({
          guildId,
          $or: [{ licensePlate: { $regex: query.trim(), $options: 'i' } }, { 'vehicles.licensePlate': { $regex: query.trim(), $options: 'i' } }],
        }).limit(10);
        return res.json({ type: 'plate', results: chars });
      }
      if (type === 'character') {
        const chars = await CADCharacter.find({ guildId, characterName: { $regex: query.trim(), $options: 'i' } }).limit(10);
        return res.json({ type: 'character', results: chars });
      }
      res.status(400).json({ error: 'type must be plate or character' });
    } catch (err) {
      res.status(500).json({ error: 'Internal error' });
    }
  });

  router.get('/leo/bolos', portalAuth, requireLeo, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      const bolos = await BOLO.find({ guildId, active: true }).sort({ createdAt: -1 }).limit(20);
      res.json(bolos);
    } catch (err) {
      res.status(500).json({ error: 'Internal error' });
    }
  });

  router.get('/leo/calls', portalAuth, requireLeo, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      const calls = await EmergencyCall.find({ guildId, status: 'active' }).sort({ timestamp: -1 }).limit(20);
      res.json(calls);
    } catch (err) {
      res.status(500).json({ error: 'Internal error' });
    }
  });

  return router;
}
