import { Router } from 'express';
import { portalAuth } from './portal.js';
import { triggerPanicAlert, announce911Call } from '../../handlers/dispatchHandler.js';
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
import OfficerStatus from '../../models/OfficerStatus.js';
import DispatchConfig from '../../models/DispatchConfig.js';
import TrafficTicket from '../../models/TrafficTicket.js';
import Ticket from '../../models/Ticket.js';
import RoleplayCalendar from '../../models/RoleplayCalendar.js';
import Priority from '../../models/Priority.js';
import Staff from '../../models/Staff.js';
import { StrikeUser } from '../../models/Strike.js';
import PendingVerification from '../../models/PendingVerification.js';
import Verification from '../../models/Verification.js';
import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { v4 as uuidv4 } from 'uuid';

const GUILD_ID = () => process.env.PORTAL_GUILD_ID;

function isLeo(user, cadConfig) {
  if (!cadConfig || !user.roles) return false;
  const userRoleIds = user.roles.map(r => r.id);
  return cadConfig.leoRoleIds?.some(id => userRoleIds.includes(id))
    || cadConfig.staffRoleIds?.some(id => userRoleIds.includes(id));
}

async function checkIsStaff(user, guildId) {
  if (!guildId || !user) return false;
  const userRoleIds = (user.roles || []).map(r => r.id);
  const entry = await Staff.findOne({
    guildId,
    $or: [
      { type: 'user', userId: user.userId },
      { type: 'role', roleId: { $in: userRoleIds } },
    ],
  });
  return !!entry;
}

// ── Discord helpers ─────────────────────────────────────────────────────────
async function sendToChannel(client, channelId, payload) {
  try {
    const channel = await client.channels.fetch(channelId);
    return await channel.send(payload);
  } catch (err) {
    console.error('[PORTAL Discord send]', err.message);
    return null;
  }
}

async function editChannelMessage(client, channelId, messageId, payload) {
  try {
    const channel = await client.channels.fetch(channelId);
    const msg = await channel.messages.fetch(messageId);
    await msg.edit({ ...payload, components: msg.components });
    return true;
  } catch {
    return false;
  }
}

// ── Officer Status Board ────────────────────────────────────────────────────
const TEN_INFO = {
  '10-6':  { label: '10-6 Busy' },
  '10-7':  { label: '10-7 Out of Service' },
  '10-8':  { label: '10-8 Available' },
  '10-10': { label: '10-10 Off Duty' },
  '10-11': { label: '10-11 Traffic Stop' },
  '10-15': { label: '10-15 Prisoner in Custody' },
  '10-50': { label: '10-50 Accident' },
  '10-76': { label: '10-76 En Route' },
  '10-78': { label: '10-78 Need Assistance' },
  '10-80': { label: '10-80 Pursuit' },
  '10-97': { label: '10-97 On Scene' },
  '10-99': { label: '10-99 Officer Down' },
};

async function rebuildStatusBoard(client, guildId, dispatchCfg) {
  if (!dispatchCfg?.statusBoardChannelId || !client) return;
  try {
    const officers = await OfficerStatus.find({ guildId });
    const lines = officers.map(o => {
      const info = TEN_INFO[o.tenCode] || { label: o.tenCode || 'Unknown' };
      let line = `**${o.username}** — ${info.label}`;
      if (o.location) line += ` | ${o.location}`;
      if (o.subject) line += ` | ${o.subject}`;
      return line;
    });

    const embed = new EmbedBuilder()
      .setColor('#2d2d2d')
      .setTitle('Officer Status Board')
      .setDescription(lines.length ? lines.join('\n') : '-# No officers currently on duty')
      .setTimestamp()
      .setFooter({ text: 'RPM' });

    const payload = { embeds: [embed] };

    if (dispatchCfg.statusBoardMessageId) {
      const edited = await editChannelMessage(client, dispatchCfg.statusBoardChannelId, dispatchCfg.statusBoardMessageId, payload);
      if (edited) return;
    }

    const msg = await sendToChannel(client, dispatchCfg.statusBoardChannelId, payload);
    if (msg) {
      dispatchCfg.statusBoardMessageId = msg.id;
      await dispatchCfg.save();
    }
  } catch (err) {
    console.error('[PORTAL rebuildStatusBoard]', err.message);
  }
}

export function createPortalApiRouter(client) {
  const router = Router();
  const auth = portalAuth(client);

  // ── /me ──────────────────────────────────────────────────────────────────
  async function requireStaff(req, res, next) {
    const guildId = GUILD_ID();
    if (!guildId) return res.status(403).json({ error: 'Not configured' });
    const staff = await checkIsStaff(req.portalUser, guildId);
    if (!staff) return res.status(403).json({ error: 'Staff access required' });
    next();
  }

  router.get('/me', auth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      const { userId, username, avatar, roles = [], displayName } = req.portalUser;
      const cadConfig = guildId ? await CADConfig.findOne({ guildId }) : null;
      const guild = guildId && client ? client.guilds.cache.get(guildId) : null;
      const isStaff = await checkIsStaff(req.portalUser, guildId);

      res.json({
        userId,
        username,
        displayName: displayName || username,
        avatar: avatar
          ? `https://cdn.discordapp.com/avatars/${userId}/${avatar}.png?size=128`
          : `https://cdn.discordapp.com/embed/avatars/${parseInt(userId) % 5}.png`,
        roles,
        isLeo: isLeo(req.portalUser, cadConfig),
        isStaff,
        serverName: guild?.name || process.env.PORTAL_SERVER_NAME || 'Member Portal',
        serverIcon: guild?.iconURL() || null,
      });
    } catch (err) {
      console.error('[PORTAL /me]', err);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  // ── Priority ─────────────────────────────────────────────────────────────
  router.get('/priority', auth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId) return res.json({ active: false });
      const priority = await Priority.findOne({ guildId });
      if (!priority?.priorityActive) return res.json({ active: false });
      res.json({
        active: true,
        issuedBy: priority.priorityIssuedBy || null,
        customMessage: priority.customMessage || null,
      });
    } catch {
      res.json({ active: false });
    }
  });

  // ── Strikes ───────────────────────────────────────────────────────────────
  router.get('/strikes', auth, async (req, res) => {
    try {
      res.json({ level: 0 });
    } catch {
      res.json({ level: 0 });
    }
  });

  // ── CAD ──────────────────────────────────────────────────────────────────
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

  router.delete('/cad/:charId', auth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      const result = await CADCharacter.findOneAndDelete({ _id: req.params.charId, guildId, userId: req.portalUser.userId });
      if (!result) return res.status(404).json({ error: 'Character not found' });
      res.json({ success: true });
    } catch (err) {
      console.error('[PORTAL /cad DELETE]', err);
      res.status(500).json({ error: 'Failed to delete character' });
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

  // ── Economy ───────────────────────────────────────────────────────────────
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

  // ── Traffic Tickets / Fines ───────────────────────────────────────────────
  router.get('/traffic-tickets', auth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId) return res.json([]);

      const chars = await CADCharacter.find({ guildId, userId: req.portalUser.userId }).select('_id');
      const charIds = chars.map(c => c._id);
      if (!charIds.length) return res.json([]);

      const tickets = await TrafficTicket.find({ guildId, characterId: { $in: charIds } })
        .sort({ createdAt: -1 })
        .limit(50);
      res.json(tickets);
    } catch (err) {
      console.error('[PORTAL /traffic-tickets]', err);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  router.post('/traffic-tickets/:ticketId/pay', auth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId) return res.status(400).json({ error: 'Portal not configured' });

      const ticket = await TrafficTicket.findOne({ guildId, ticketId: req.params.ticketId });
      if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
      if (ticket.paid) return res.status(400).json({ error: 'This fine is already paid' });

      const chars = await CADCharacter.find({ guildId, userId: req.portalUser.userId }).select('_id');
      const charIds = chars.map(c => c._id.toString());
      if (!charIds.includes(ticket.characterId.toString())) {
        return res.status(403).json({ error: 'This ticket does not belong to your characters' });
      }

      const balance = await EconomyBalance.findOne({ guildId, userId: req.portalUser.userId });
      if (!balance) return res.status(400).json({ error: 'No economy account found' });

      const amount = ticket.fine || 0;
      if (balance.bank < amount) {
        const config = await EconomyConfig.findOne({ guildId });
        const sym = config?.currencySymbol || '$';
        return res.status(400).json({
          error: `Insufficient bank balance. Fine: ${sym}${amount.toLocaleString()}, Bank: ${sym}${balance.bank.toLocaleString()}`,
        });
      }

      balance.bank -= amount;
      await balance.save();

      ticket.paid = true;
      ticket.paidAt = new Date();
      await ticket.save();

      const config = await EconomyConfig.findOne({ guildId });
      res.json({ success: true, newBank: balance.bank, currency: config?.currencySymbol || '$' });
    } catch (err) {
      console.error('[PORTAL /traffic-tickets/pay]', err);
      res.status(500).json({ error: 'Payment failed' });
    }
  });

  // ── Support Tickets ───────────────────────────────────────────────────────
  router.get('/tickets', auth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId) return res.json([]);
      const tickets = await Ticket.find({ guildId, userId: req.portalUser.userId })
        .sort({ createdAt: -1 })
        .limit(20);
      res.json(tickets);
    } catch (err) {
      console.error('[PORTAL /tickets]', err);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  // ── Calendar ──────────────────────────────────────────────────────────────
  router.get('/calendar', auth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId) return res.json([]);
      const cal = await RoleplayCalendar.findOne({ guildId });
      if (!cal?.enabled || !cal.events?.length) return res.json([]);
      const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      const sorted = [...cal.events].sort((a, b) => dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day));
      res.json(sorted);
    } catch (err) {
      console.error('[PORTAL /calendar]', err);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  // ── Dispatch / 911 ────────────────────────────────────────────────────────
  router.get('/dispatch/mine', auth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId) return res.json([]);
      const calls = await EmergencyCall.find({ guildId, reporterId: req.portalUser.userId })
        .sort({ timestamp: -1 })
        .limit(20);
      res.json(calls);
    } catch (err) {
      console.error('[PORTAL /dispatch/mine]', err);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  router.post('/dispatch/submit', auth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!guildId || !client) return res.status(400).json({ error: 'Portal not configured' });

      const { issue, location, suspectsDescription, lastSeen, contact } = req.body;
      if (!issue?.trim()) return res.status(400).json({ error: 'Emergency description is required' });
      if (!location?.trim()) return res.status(400).json({ error: 'Location is required' });

      const callId = `911-${Date.now().toString(36).toUpperCase()}`;
      const call = new EmergencyCall({
        guildId,
        callId,
        reporterId: req.portalUser.userId,
        reporterUsername: req.portalUser.displayName || req.portalUser.username,
        issue: issue.trim(),
        location: location.trim(),
        suspectsDescription: suspectsDescription?.trim() || null,
        lastSeen: lastSeen?.trim() || null,
        contact: contact?.trim() || null,
        status: 'active',
        timestamp: new Date(),
      });
      await call.save();

      const dispatchCfg = await DispatchConfig.findOne({ guildId });
      const guild = client.guilds.cache.get(guildId);

      if (guild && dispatchCfg?.dispatchChannelId) {
        announce911Call(guild, call, dispatchCfg).catch(err => {
          console.error('[PORTAL 911] announce911Call error:', err.message);
        });
      }

      res.json({ success: true, callId });
    } catch (err) {
      console.error('[PORTAL /dispatch/submit]', err);
      res.status(500).json({ error: 'Failed to submit call' });
    }
  });

  router.delete('/dispatch/:callId/cancel', auth, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      const call = await EmergencyCall.findOne({ guildId, callId: req.params.callId, reporterId: req.portalUser.userId });
      if (!call) return res.status(404).json({ error: 'Call not found' });
      if (call.status !== 'active') return res.status(400).json({ error: 'Call is not active' });
      call.status = 'closed';
      call.closedBy = req.portalUser.displayName || req.portalUser.username;
      await call.save();

      if (call.messageId && call.channelId && client) {
        const guild = client.guilds.cache.get(guildId);
        const ch = guild?.channels.cache.get(call.channelId);
        if (ch?.isTextBased()) {
          ch.messages.fetch(call.messageId).then(msg => {
            msg.edit({
              embeds: [new EmbedBuilder()
                .setColor('#2d2d2d')
                .setTitle('911 Call — Cancelled')
                .setDescription(`**Call ID:** \`${call.callId}\`\nThis call was cancelled by the reporter.`)
                .setTimestamp()
                .setFooter({ text: 'RPM • 911 Dispatch' })],
              components: [],
            }).catch(() => {});
          }).catch(() => {});
        }
      }

      const dispatchCfg = await DispatchConfig.findOne({ guildId });
      await rebuildStatusBoard(client, guildId, dispatchCfg);

      res.json({ success: true });
    } catch (err) {
      console.error('[PORTAL /dispatch/cancel]', err);
      res.status(500).json({ error: 'Failed to cancel call' });
    }
  });

  // ── Role Requests ─────────────────────────────────────────────────────────
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
      for (const memberId of (roleType.approverMemberIds || [])) {
        try {
          const m = await guild.members.fetch(memberId);
          approvers.push({ id: m.id, name: m.displayName });
        } catch { /* skip */ }
      }

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
        // DM failed — request still created
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

  // ── LEO (role-gated) ──────────────────────────────────────────────────────
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

      let chars = [];
      if (type === 'plate') {
        chars = await CADCharacter.find({
          guildId,
          $or: [
            { licensePlate: { $regex: query.trim(), $options: 'i' } },
            { 'vehicles.licensePlate': { $regex: query.trim(), $options: 'i' } },
          ],
        }).limit(10);
      } else if (type === 'character') {
        chars = await CADCharacter.find({
          guildId,
          characterName: { $regex: query.trim(), $options: 'i' },
        }).limit(10);
      } else {
        return res.status(400).json({ error: 'type must be plate or character' });
      }

      const charIds = chars.map(c => c._id);
      const charNames = chars.map(c => c.characterName);
      const [bolosRaw, ticketsRaw] = await Promise.all([
        BOLO.find({ guildId, $or: [{ characterId: { $in: charIds } }, { characterName: { $in: charNames } }], active: true }),
        TrafficTicket.find({ guildId, characterId: { $in: charIds.map(id => id.toString()) } }).sort({ createdAt: -1 }),
      ]);

      const bolosByChar = {};
      for (const b of bolosRaw) {
        const key = b.characterId.toString();
        if (!bolosByChar[key]) bolosByChar[key] = [];
        bolosByChar[key].push(b);
      }
      const ticketsByChar = {};
      for (const t of ticketsRaw) {
        const key = t.characterId.toString();
        if (!ticketsByChar[key]) ticketsByChar[key] = [];
        ticketsByChar[key].push(t);
      }

      const results = chars.map(c => ({
        ...c.toObject(),
        bolos: bolosByChar[c._id.toString()] || [],
        tickets: ticketsByChar[c._id.toString()] || [],
      }));

      return res.json({ type, results });
    } catch (err) {
      console.error('[PORTAL /leo/search]', err);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  router.delete('/leo/bolos/:boloId', auth, requireLeo, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      const id = req.params.boloId;
      let bolo = await BOLO.findOneAndDelete({ guildId, boloId: id });
      if (!bolo) {
        try { bolo = await BOLO.findOneAndDelete({ guildId, _id: id }); } catch {}
      }
      if (!bolo) return res.status(404).json({ error: 'BOLO not found' });
      res.json({ success: true });
    } catch (err) {
      console.error('[PORTAL /leo/bolos/delete]', err);
      res.status(500).json({ error: 'Failed to delete BOLO' });
    }
  });

  router.post('/leo/bolos/create', auth, requireLeo, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      const { characterName, reason, description, vehicles } = req.body;
      if (!characterName?.trim()) return res.status(400).json({ error: 'Character name required' });
      if (!reason?.trim()) return res.status(400).json({ error: 'Reason required' });

      const character = await CADCharacter.findOne({ guildId, characterName: { $regex: characterName.trim(), $options: 'i' } });
      if (!character) return res.status(404).json({ error: `No character found for "${characterName.trim()}"` });

      const boloId = `BOLO-${Date.now()}`;
      const bolo = new BOLO({
        guildId,
        boloId,
        characterId: character._id,
        characterName: character.characterName,
        reason: reason.trim(),
        description: description?.trim() || '',
        vehicles: Array.isArray(vehicles) ? vehicles : [],
        issuedBy: req.portalUser.userId,
        active: true,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });
      await bolo.save();
      res.json({ success: true, bolo });
    } catch (err) {
      console.error('[PORTAL /leo/bolos/create]', err);
      res.status(500).json({ error: 'Failed to create BOLO' });
    }
  });

  router.post('/leo/issue-ticket', auth, requireLeo, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      const { characterName, violation, description, fine } = req.body;
      if (!characterName?.trim()) return res.status(400).json({ error: 'Character name required' });
      if (!violation?.trim()) return res.status(400).json({ error: 'Violation required' });

      const character = await CADCharacter.findOne({ guildId, characterName: { $regex: characterName.trim(), $options: 'i' } });
      if (!character) return res.status(404).json({ error: `No character found for "${characterName.trim()}"` });

      const ticketId = `TKT-${Date.now()}`;
      const ticket = new TrafficTicket({
        guildId,
        ticketId,
        characterId: character._id,
        characterName: character.characterName,
        issuedBy: req.portalUser.displayName || req.portalUser.username,
        violation: violation.trim(),
        description: description?.trim() || '',
        fine: parseInt(fine) || 0,
      });
      await ticket.save();
      res.json({ success: true, ticket });
    } catch (err) {
      console.error('[PORTAL /leo/issue-ticket]', err);
      res.status(500).json({ error: 'Failed to issue ticket' });
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

  router.post('/leo/calls/:callId/respond', auth, requireLeo, async (req, res) => {
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

      if (dispatchCfg?.dispatchChannelId && client) {
        const embed = new EmbedBuilder()
          .setColor(0x4f7ef7)
          .setTitle(`Officer Responding — ${call.callId}`)
          .setDescription(`**${displayName}** is responding via the Member Portal.\n**Status:** 10-76 En Route${call.location ? `\n**Location:** ${call.location}` : ''}`)
          .setTimestamp()
          .setFooter({ text: 'RPM Portal • Status auto-set to 10-76' });
        await sendToChannel(client, dispatchCfg.dispatchChannelId, { embeds: [embed] });
      }

      await rebuildStatusBoard(client, guildId, dispatchCfg);
      res.json({ success: true, call });
    } catch (err) {
      console.error('[PORTAL /leo/calls/respond]', err);
      res.status(500).json({ error: 'Failed to respond to call' });
    }
  });

  router.post('/leo/calls/:callId/attach', auth, requireLeo, async (req, res) => {
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

      await rebuildStatusBoard(client, guildId, dispatchCfg);
      res.json({ success: true, call });
    } catch (err) {
      console.error('[PORTAL /leo/calls/attach]', err);
      res.status(500).json({ error: 'Failed to attach to call' });
    }
  });

  router.delete('/leo/calls/:callId', auth, requireLeo, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      const call = await EmergencyCall.findOne({ guildId, callId: req.params.callId, status: 'active' });
      if (!call) return res.status(404).json({ error: 'Call not found or already closed' });

      const userId = req.portalUser.userId;
      const isResponder = call.respondingLeoId === userId;
      const isAttached = (call.attachedLeoIds || []).includes(userId);

      const cadConfig = await CADConfig.findOne({ guildId });
      const userRoles = req.portalUser.roles || [];
      const isStaff = cadConfig?.staffRoleIds?.some(id => userRoles.includes(id));

      if (!isResponder && !isAttached && !isStaff)
        return res.status(403).json({ error: 'Only the responding or attached officer (or staff) can dismiss this call' });

      call.status = 'closed';
      call.closedAt = new Date();
      call.closedBy = req.portalUser.displayName || req.portalUser.username;
      await call.save();

      const dispatchCfg = await DispatchConfig.findOne({ guildId });
      await rebuildStatusBoard(client, guildId, dispatchCfg);
      res.json({ success: true });
    } catch (err) {
      console.error('[PORTAL /leo/calls/dismiss]', err);
      res.status(500).json({ error: 'Failed to dismiss call' });
    }
  });

  router.get('/leo/officers', auth, requireLeo, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      const officers = await OfficerStatus.find({ guildId }).sort({ updatedAt: -1 });
      res.json(officers);
    } catch (err) {
      console.error('[PORTAL /leo/officers]', err);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  router.get('/leo/mystatus', auth, requireLeo, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      const status = await OfficerStatus.findOne({ guildId, userId: req.portalUser.userId });
      res.json(status || null);
    } catch (err) {
      console.error('[PORTAL /leo/mystatus]', err);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  router.post('/leo/status', auth, requireLeo, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      const { tenCode, location, subject } = req.body;
      if (!tenCode) return res.status(400).json({ error: 'Ten-code is required' });

      const status = await OfficerStatus.findOneAndUpdate(
        { guildId, userId: req.portalUser.userId },
        {
          username: req.portalUser.displayName || req.portalUser.username,
          tenCode,
          location: location?.trim() || null,
          subject: subject?.trim() || null,
          updatedAt: new Date(),
        },
        { upsert: true, new: true }
      );

      const dispatchCfg = await DispatchConfig.findOne({ guildId });
      await rebuildStatusBoard(client, guildId, dispatchCfg);

      res.json({ success: true, status });
    } catch (err) {
      console.error('[PORTAL /leo/status POST]', err);
      res.status(500).json({ error: 'Failed to update status' });
    }
  });

  router.delete('/leo/status', auth, requireLeo, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      await OfficerStatus.findOneAndDelete({ guildId, userId: req.portalUser.userId });

      const dispatchCfg = await DispatchConfig.findOne({ guildId });
      await rebuildStatusBoard(client, guildId, dispatchCfg);

      res.json({ success: true });
    } catch (err) {
      console.error('[PORTAL /leo/status DELETE]', err);
      res.status(500).json({ error: 'Failed to go off duty' });
    }
  });

  router.post('/leo/panic', auth, requireLeo, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      if (!client) return res.status(400).json({ error: 'Portal not configured' });

      const { location } = req.body;
      const username = req.portalUser.displayName || req.portalUser.username;
      const userId = req.portalUser.userId;

      await OfficerStatus.findOneAndUpdate(
        { guildId, userId },
        {
          username,
          tenCode: '10-99',
          location: location?.trim() || null,
          subject: 'PANIC — Officer needs immediate assistance',
          updatedAt: new Date(),
        },
        { upsert: true, new: true }
      );

      const dispatchCfg = await DispatchConfig.findOne({ guildId });
      const guild = client.guilds.cache.get(guildId);

      if (guild && dispatchCfg?.dispatchChannelId) {
        await triggerPanicAlert(guild, dispatchCfg, userId, username, null).catch(err => {
          console.error('[PORTAL panic] triggerPanicAlert error:', err.message);
        });
      }

      await rebuildStatusBoard(client, guildId, dispatchCfg);

      res.json({ success: true });
    } catch (err) {
      console.error('[PORTAL /leo/panic]', err);
      res.status(500).json({ error: 'Failed to send panic' });
    }
  });

  // ── STAFF PANEL ───────────────────────────────────────────────────────────

  router.get('/staff/stats', auth, requireStaff, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      const [pendingVerifs, openTickets, activeBolos, strikeCount] = await Promise.all([
        PendingVerification.countDocuments({ guildId }),
        Ticket.countDocuments({ guildId, status: 'open' }),
        BOLO.countDocuments({ guildId, active: true }),
        StrikeUser.countDocuments({ guildId, currentStrikeLevel: { $gt: 0 } }),
      ]);
      res.json({ pendingVerifs, openTickets, activeBolos, strikeCount });
    } catch (err) {
      console.error('[PORTAL /staff/stats]', err);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  router.get('/staff/members', auth, requireStaff, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      const { q } = req.query;
      if (!q?.trim()) return res.json([]);
      if (!client) return res.json([]);
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return res.json([]);
      const members = await guild.members.search({ query: q.trim(), limit: 10 });
      const results = members.map(m => ({
        userId: m.id,
        username: m.user.username,
        displayName: m.displayName,
        avatar: m.user.avatar
          ? `https://cdn.discordapp.com/avatars/${m.id}/${m.user.avatar}.png?size=64`
          : `https://cdn.discordapp.com/embed/avatars/${parseInt(m.id) % 5}.png`,
        roles: m.roles.cache
          .filter(r => r.id !== guild.id)
          .map(r => ({ id: r.id, name: r.name, color: r.hexColor }))
          .slice(0, 5),
      }));
      res.json(results);
    } catch (err) {
      console.error('[PORTAL /staff/members]', err);
      res.status(500).json({ error: 'Failed to search members' });
    }
  });

  router.get('/staff/member/:userId', auth, requireStaff, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      const { userId } = req.params;
      const [strikeDoc, cadChars, tickets, trafficTickets] = await Promise.all([
        StrikeUser.findOne({ guildId, userId }),
        CADCharacter.find({ guildId, userId }).select('characterName status wantedReason vehicles').limit(5),
        Ticket.find({ guildId, userId }).sort({ createdAt: -1 }).limit(5),
        TrafficTicket.find({ guildId }).populate({ path: 'characterId' }).sort({ createdAt: -1 }).limit(0),
      ]);
      const userTickets = await TrafficTicket.find({
        guildId,
        characterId: { $in: cadChars.map(c => c._id) },
      }).sort({ createdAt: -1 }).limit(5);
      res.json({
        strikeLevel: strikeDoc?.currentStrikeLevel || 0,
        cadChars,
        supportTickets: tickets,
        trafficTickets: userTickets,
      });
    } catch (err) {
      console.error('[PORTAL /staff/member/:userId]', err);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  router.post('/staff/member/:userId/strike', auth, requireStaff, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      const { userId } = req.params;
      let strike = await StrikeUser.findOne({ guildId, userId });
      if (!strike) strike = new StrikeUser({ guildId, userId, currentStrikeLevel: 0 });
      if (strike.currentStrikeLevel >= 4) return res.status(400).json({ error: 'Maximum strike level (4) already reached' });
      strike.currentStrikeLevel += 1;
      await strike.save();
      res.json({ success: true, strikeLevel: strike.currentStrikeLevel });
    } catch (err) {
      console.error('[PORTAL /staff/member/strike POST]', err);
      res.status(500).json({ error: 'Failed to add strike' });
    }
  });

  router.delete('/staff/member/:userId/strike', auth, requireStaff, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      const { userId } = req.params;
      const strike = await StrikeUser.findOne({ guildId, userId });
      if (!strike || strike.currentStrikeLevel <= 0) return res.status(400).json({ error: 'No strikes to remove' });
      strike.currentStrikeLevel -= 1;
      await strike.save();
      res.json({ success: true, strikeLevel: strike.currentStrikeLevel });
    } catch (err) {
      console.error('[PORTAL /staff/member/strike DELETE]', err);
      res.status(500).json({ error: 'Failed to remove strike' });
    }
  });

  router.get('/staff/verifications', auth, requireStaff, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      const pending = await PendingVerification.find({ guildId }).sort({ createdAt: -1 }).limit(30);
      res.json(pending);
    } catch (err) {
      console.error('[PORTAL /staff/verifications]', err);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  router.post('/staff/verifications/:userId/approve', auth, requireStaff, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      const { userId } = req.params;
      const pending = await PendingVerification.findOne({ guildId, userId });
      if (!pending) return res.status(404).json({ error: 'No pending verification found' });

      const verif = await Verification.findOne({ guildId });
      if (client && verif) {
        const guild = client.guilds.cache.get(guildId);
        if (guild) {
          try {
            const member = await guild.members.fetch(userId);
            if (verif.verifiedRoleId) await member.roles.add(verif.verifiedRoleId).catch(() => {});
            if (verif.unverifiedRoleId) await member.roles.remove(verif.unverifiedRoleId).catch(() => {});
          } catch { /* member may have left */ }
        }
      }

      await PendingVerification.deleteOne({ guildId, userId });
      res.json({ success: true });
    } catch (err) {
      console.error('[PORTAL /staff/verifications/approve]', err);
      res.status(500).json({ error: 'Failed to approve verification' });
    }
  });

  router.delete('/staff/verifications/:userId/deny', auth, requireStaff, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      const { userId } = req.params;
      const result = await PendingVerification.deleteOne({ guildId, userId });
      if (!result.deletedCount) return res.status(404).json({ error: 'No pending verification found' });
      res.json({ success: true });
    } catch (err) {
      console.error('[PORTAL /staff/verifications/deny]', err);
      res.status(500).json({ error: 'Failed to deny verification' });
    }
  });

  router.get('/staff/tickets', auth, requireStaff, async (req, res) => {
    try {
      const guildId = GUILD_ID();
      const tickets = await Ticket.find({ guildId, status: 'open' }).sort({ createdAt: -1 }).limit(30);
      res.json(tickets);
    } catch (err) {
      console.error('[PORTAL /staff/tickets]', err);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  return router;
}
