import { Router } from 'express';
import { portalAuth } from './portal.js';
import CADCharacter from '../../models/CADCharacter.js';
import CADConfig from '../../models/CADConfig.js';
import EconomyBalance from '../../models/EconomyBalance.js';
import EconomyStore from '../../models/EconomyStore.js';
import EconomyInventory from '../../models/EconomyInventory.js';
import EconomyConfig from '../../models/EconomyConfig.js';
import BOLO from '../../models/BOLO.js';
import RoleRequestConfig from '../../models/RoleRequestConfig.js';
import RoleRequest from '../../models/RoleRequest.js';
import EmergencyCall from '../../models/EmergencyCall.js';
import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { v4 as uuidv4 } from 'uuid';

const GUILD_ID = () => process.env.PORTAL_GUILD_ID;

function isLeo(user, cadConfig) {
  if (!cadConfig || !user.roles) return false;
  const userRoleIds = user.roles.map(r => r.id);
  return cadConfig.leoRoleIds?.some(id => userRoleIds.includes(id))
    || cadConfig.staffRoleIds?.some(id => userRoleIds.includes(id));
}

export function createPortalApiRouter(client) {
  const router = Router();
  const auth = portalAuth(client);

  // ── /me ────────────────────────────────────────────────────────────────────
  router.get('/me', auth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      const { userId, username, avatar, roles = [], displayName } = req.portalUser;
      const cadConfig = guildId ? await CADConfig.findOne({ guildId }) : null;

      const guild = guildId && client ? client.guilds.cache.get(guildId) : null;

      res.json({
        userId,
        username,
        displayName: displayName || username,
        avatar: avatar
          ? `https://cdn.discordapp.com/avatars/${userId}/${avatar}.png?size=128`
          : `https://cdn.discordapp.com/embed/avatars/${parseInt(userId) % 5}.png`,
        roles,
        isLeo: isLeo(req.portalUser, cadConfig),
        serverName: guild?.name || process.env.PORTAL_SERVER_NAME || 'Member Portal',
        serverIcon: guild?.iconURL() || null,
      });
    } catch (err) {
      console.error('[PORTAL /me]', err);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  // ── CAD ────────────────────────────────────────────────────────────────────
  router.get('/cad', auth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId) return res.json([]);
      const chars = await CADCharacter.find({ guildId, userId: req.portalUser.userId });
      res.json(chars);
    } catch (err) {
      console.error('[PORTAL /cad]', err);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  router.post('/cad/create', auth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId) return res.status(400).json({ error: 'Portal not configured' });

      const { characterName, age, gender, hairColor, eyeColor, height, occupation, address, phoneNumber, emergencyContact } = req.body;
      if (!characterName?.trim()) return res.status(400).json({ error: 'Character name is required' });

      const existing = await CADCharacter.countDocuments({ guildId, userId: req.portalUser.userId });
      if (existing >= 5) return res.status(400).json({ error: 'Maximum of 5 characters reached' });

      const char = new CADCharacter({
        guildId,
        userId: req.portalUser.userId,
        characterName: characterName.trim(),
        age: age ? parseInt(age) : null,
        gender: gender || null,
        hairColor: hairColor || null,
        eyeColor: eyeColor || null,
        height: height || null,
        occupation: occupation || null,
        address: address || null,
        phoneNumber: phoneNumber || null,
        emergencyContact: emergencyContact || null,
        status: 'clean',
      });
      await char.save();
      res.json(char);
    } catch (err) {
      console.error('[PORTAL /cad/create]', err);
      res.status(500).json({ error: 'Failed to create character' });
    }
  });

  router.post('/cad/:charId/vehicle', auth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      const char = await CADCharacter.findOne({ _id: req.params.charId, guildId, userId: req.portalUser.userId });
      if (!char) return res.status(404).json({ error: 'Character not found' });

      const { make, model, color, licensePlate, year } = req.body;
      if (!make || !model) return res.status(400).json({ error: 'Make and model required' });

      char.vehicles.push({ make, model, color, licensePlate, year, addedAt: new Date() });
      await char.save();
      res.json(char);
    } catch (err) {
      console.error('[PORTAL /cad/vehicle]', err);
      res.status(500).json({ error: 'Failed to add vehicle' });
    }
  });

  // ── Economy ────────────────────────────────────────────────────────────────
  router.get('/economy', auth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId) return res.json({ cash: 0, bank: 0, currency: '$' });

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
      console.error('[PORTAL /economy]', err);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  router.get('/economy/shop', auth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId) return res.json([]);
      const items = await EconomyStore.find({ guildId });
      res.json(items);
    } catch (err) {
      console.error('[PORTAL /economy/shop]', err);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  router.post('/economy/buy', auth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId) return res.status(400).json({ error: 'Portal not configured' });

      const { itemName, quantity = 1 } = req.body;
      const qty = Math.max(1, Math.min(99, parseInt(quantity) || 1));

      const item = await EconomyStore.findOne({ guildId, name: itemName });
      if (!item) return res.status(404).json({ error: 'Item not found' });

      const totalCost = item.price * qty;

      let balance = await EconomyBalance.findOne({ guildId, userId: req.portalUser.userId });
      if (!balance) return res.status(400).json({ error: 'No economy account. Use /balance in Discord first.' });
      if (balance.cash < totalCost) {
        const config = await EconomyConfig.findOne({ guildId });
        return res.status(400).json({ error: `Not enough cash. Need ${config?.currencySymbol || '$'}${totalCost.toLocaleString()}.` });
      }

      balance.cash -= totalCost;
      await balance.save();

      let inv = await EconomyInventory.findOne({ guildId, userId: req.portalUser.userId });
      if (!inv) inv = new EconomyInventory({ guildId, userId: req.portalUser.userId, items: [] });

      const existing = inv.items.find(i => i.itemName === itemName);
      if (existing) {
        existing.quantity += qty;
      } else {
        inv.items.push({ itemName, quantity: qty });
      }
      await inv.save();

      const config = await EconomyConfig.findOne({ guildId });
      res.json({ success: true, newCash: balance.cash, currency: config?.currencySymbol || '$' });
    } catch (err) {
      console.error('[PORTAL /economy/buy]', err);
      res.status(500).json({ error: 'Purchase failed' });
    }
  });

  router.get('/economy/leaderboard', auth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId) return res.json([]);

      const balances = await EconomyBalance.find({ guildId })
        .sort({ bank: -1 })
        .limit(10);

      const guild = client?.guilds.cache.get(guildId);
      const entries = await Promise.all(balances.map(async (b, i) => {
        let name = b.userId;
        if (guild) {
          try {
            const member = await guild.members.fetch(b.userId);
            name = member.displayName;
          } catch { name = 'Unknown'; }
        }
        return { rank: i + 1, name, cash: b.cash, bank: b.bank, total: b.cash + b.bank };
      }));

      const config = await EconomyConfig.findOne({ guildId });
      res.json({ entries, currency: config?.currencySymbol || '$' });
    } catch (err) {
      console.error('[PORTAL /economy/leaderboard]', err);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  // ── Role Requests ──────────────────────────────────────────────────────────
  router.get('/rolerequest/types', auth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId) return res.json([]);
      const config = await RoleRequestConfig.findOne({ guildId });
      if (!config?.enabled) return res.json([]);
      res.json(config.roles || []);
    } catch (err) {
      console.error('[PORTAL /rolerequest/types]', err);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  router.get('/rolerequest/approvers/:roleTypeId', auth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId || !client) return res.json([]);

      const config = await RoleRequestConfig.findOne({ guildId });
      const roleType = config?.roles?.find(r => r.id === req.params.roleTypeId);
      if (!roleType) return res.status(404).json({ error: 'Role type not found' });

      const guild = client.guilds.cache.get(guildId);
      if (!guild) return res.json([]);

      const approvers = [];

      // Collect approver members from IDs
      for (const memberId of (roleType.approverMemberIds || [])) {
        try {
          const m = await guild.members.fetch(memberId);
          approvers.push({ id: m.id, name: m.displayName });
        } catch { /* skip */ }
      }

      // Collect members who have approver roles
      if (roleType.approverRoleIds?.length > 0) {
        try {
          const allMembers = await guild.members.fetch({ limit: 0 });
          for (const [, member] of allMembers) {
            if (member.user.bot) continue;
            if (approvers.find(a => a.id === member.id)) continue;
            const hasRole = roleType.approverRoleIds.some(rid => member.roles.cache.has(rid));
            if (hasRole) approvers.push({ id: member.id, name: member.displayName });
          }
        } catch { /* skip */ }
      }

      res.json(approvers);
    } catch (err) {
      console.error('[PORTAL /rolerequest/approvers]', err);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  router.post('/rolerequest/submit', auth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId || !client) return res.status(400).json({ error: 'Portal not configured' });

      const { roleTypeId, approverId } = req.body;
      if (!roleTypeId || !approverId) return res.status(400).json({ error: 'Role type and approver required' });

      const config = await RoleRequestConfig.findOne({ guildId });
      const roleType = config?.roles?.find(r => r.id === roleTypeId);
      if (!roleType) return res.status(404).json({ error: 'Role type not found' });

      const guild = client.guilds.cache.get(guildId);
      if (!guild) return res.status(400).json({ error: 'Server not found' });

      const approverMember = await guild.members.fetch(approverId).catch(() => null);
      if (!approverMember) return res.status(400).json({ error: 'Approver not found in server' });

      // Verify approver is authorized
      let authorized = roleType.approverMemberIds?.includes(approverId);
      if (!authorized) {
        authorized = roleType.approverRoleIds?.some(rid => approverMember.roles.cache.has(rid));
      }
      if (!authorized) return res.status(403).json({ error: 'That member is not an authorized approver' });

      const requestId = `ROLEREQ-${Date.now()}`;
      const newRequest = new RoleRequest({
        guildId,
        requestId,
        requesterId: req.portalUser.userId,
        requesterUsername: req.portalUser.username,
        roleId: roleType.roleId,
        roleName: roleType.roleName,
        approverId,
        approverUsername: approverMember.user.username,
        timestamp: new Date(),
      });
      await newRequest.save();

      // DM the approver
      try {
        const dmEmbed = new EmbedBuilder()
          .setColor('#2d2d2d')
          .setTitle('Role Request Approval')
          .setDescription(`${req.portalUser.username} has requested the role **${roleType.roleName}** via the Member Portal`)
          .addFields(
            { name: 'Requester', value: req.portalUser.username, inline: true },
            { name: 'Requested Role', value: roleType.roleName, inline: true }
          )
          .setFooter({ text: 'RPM' });

        const buttons = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`approve_rolereq_${requestId}`).setLabel('Approve').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`deny_rolereq_${requestId}`).setLabel('Deny').setStyle(ButtonStyle.Danger)
        );

        const dmMsg = await approverMember.send({ embeds: [dmEmbed], components: [buttons] });
        newRequest.messageId = dmMsg.id;
        newRequest.dmChannelId = dmMsg.channelId;
        await newRequest.save();
      } catch {
        // DM failed - still created the request
      }

      res.json({ success: true, requestId });
    } catch (err) {
      console.error('[PORTAL /rolerequest/submit]', err);
      res.status(500).json({ error: 'Failed to submit request' });
    }
  });

  router.get('/rolerequest/mine', auth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId) return res.json([]);
      const requests = await RoleRequest.find({ guildId, requesterId: req.portalUser.userId })
        .sort({ timestamp: -1 }).limit(10);
      res.json(requests);
    } catch (err) {
      res.status(500).json({ error: 'Internal error' });
    }
  });

  // ── LEO (role-gated) ───────────────────────────────────────────────────────
  async function requireLeo(req, res, next) {
    const guildId = GUILD_ID();
    if (!guildId) return res.status(403).json({ error: 'Not configured' });
    const cadConfig = await CADConfig.findOne({ guildId });
    if (!isLeo(req.portalUser, cadConfig)) {
      return res.status(403).json({ error: 'LEO access required' });
    }
    next();
  }

  router.get('/leo/search', auth, requireLeo, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      const { type, query } = req.query;
      if (!query?.trim()) return res.status(400).json({ error: 'Query required' });

      if (type === 'plate') {
        const chars = await CADCharacter.find({
          guildId,
          $or: [
            { licensePlate: { $regex: query.trim(), $options: 'i' } },
            { 'vehicles.licensePlate': { $regex: query.trim(), $options: 'i' } },
          ],
        }).limit(10);
        return res.json({ type: 'plate', results: chars });
      }

      if (type === 'character') {
        const chars = await CADCharacter.find({
          guildId,
          characterName: { $regex: query.trim(), $options: 'i' },
        }).limit(10);
        return res.json({ type: 'character', results: chars });
      }

      res.status(400).json({ error: 'type must be plate or character' });
    } catch (err) {
      console.error('[PORTAL /leo/search]', err);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  router.get('/leo/bolos', auth, requireLeo, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      const bolos = await BOLO.find({ guildId, active: true }).sort({ createdAt: -1 }).limit(20);
      res.json(bolos);
    } catch (err) {
      console.error('[PORTAL /leo/bolos]', err);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  router.get('/leo/calls', auth, requireLeo, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      const calls = await EmergencyCall.find({ guildId, status: 'active' }).sort({ timestamp: -1 }).limit(20);
      res.json(calls);
    } catch (err) {
      console.error('[PORTAL /leo/calls]', err);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  return router;
}
