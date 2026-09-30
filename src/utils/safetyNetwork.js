import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } from 'discord.js';
import SafetyNetworkConfig from '../models/SafetyNetworkConfig.js';
import NetworkBan from '../models/NetworkBan.js';
import { hasPremiumAccess } from './premiumCheck.js';

/**
 * The Safety Network.
 *
 * Trolls and raiders move from one console RP server to the next. Servers
 * that opt in share their bans; when someone banned by other servers in the
 * network joins a server that asked to be warned, its staff get a warning
 * with the reasons and one press to ban or kick. Nobody is banned
 * automatically unless a Premium server turned that on.
 *
 * Guards against misuse:
 *   - only servers with at least NETWORK_MIN_MEMBERS members count, so a
 *     throwaway server cannot flag people;
 *   - a server that stops sharing, or removes the bot, stops counting at once;
 *   - bans the network itself caused (an automatic ban, or a Ban button on a
 *     warning) are not shared back, so one ban cannot snowball;
 *   - an unban withdraws the shared ban;
 *   - other servers see the reason, the size of the server and when, never
 *     which server it was.
 */

export const NETWORK_MIN_MEMBERS = 10;
export const AUTOBAN_CHOICES = [2, 3, 5];
const REASON_MAX = 200;
// Every ban the network causes carries this, which is how it is kept out.
const NETWORK_REASON = 'Safety Network';

const clean = (r) => (r ? String(r).replace(/\s+/g, ' ').trim().slice(0, REASON_MAX) || null : null);
const fromNetwork = (r) => typeof r === 'string' && r.startsWith(NETWORK_REASON);
const unix = (d) => Math.floor(new Date(d).getTime() / 1000);

let sharing = { at: 0, ids: new Set() };
async function sharingGuilds() {
  if (Date.now() - sharing.at < 60 * 1000) return sharing.ids;
  const ids = await SafetyNetworkConfig.distinct('guildId', { share: true });
  sharing = { at: Date.now(), ids: new Set(ids) };
  return sharing.ids;
}
export function forgetSharingCache() { sharing.at = 0; }

/** Servers that share their bans and count: the bot is in them and they are big enough. */
export async function networkSize(client) {
  let n = 0;
  for (const id of await sharingGuilds()) {
    const g = client?.guilds?.cache?.get(id);
    if (g && (g.memberCount || 0) >= NETWORK_MIN_MEMBERS) n++;
  }
  return n;
}

/** Record one ban from a server that shares. Bans the network caused are skipped. */
export async function recordBan(guildId, userId, reason, source = 'ban') {
  if (fromNetwork(reason)) return false;
  await NetworkBan.updateOne(
    { guildId, userId },
    { $set: { reason: clean(reason), bannedAt: new Date(), source, active: true } },
    { upsert: true },
  );
  return true;
}

/** guildBanAdd. The event carries no reason, so the ban is fetched for it. */
export async function onBanAdd(ban) {
  const guildId = ban?.guild?.id;
  if (!guildId || !ban.user || ban.user.bot) return;
  if (!(await sharingGuilds()).has(guildId)) return;
  const full = await ban.guild.bans.fetch({ user: ban.user.id, force: true }).catch(() => null);
  await recordBan(guildId, ban.user.id, full?.reason ?? ban.reason ?? null);
}

/** guildBanRemove: an unban withdraws the shared ban. */
export async function onBanRemove(ban) {
  if (!ban?.guild?.id || !ban.user?.id) return;
  await NetworkBan.updateOne({ guildId: ban.guild.id, userId: ban.user.id }, { $set: { active: false } });
}

/**
 * A server that starts sharing brings its existing ban list, so the network
 * is useful from the first day rather than after months of new bans.
 */
export async function importBans(guild, max = 5000) {
  let imported = 0;
  let after;
  try {
    for (let page = 0; page < Math.ceil(max / 1000); page++) {
      const bans = await guild.bans.fetch({ limit: 1000, ...(after ? { after } : {}) });
      if (!bans.size) break;
      const ops = [];
      for (const b of bans.values()) {
        if (!b.user || b.user.bot || fromNetwork(b.reason)) continue;
        ops.push({
          updateOne: {
            filter: { guildId: guild.id, userId: b.user.id },
            update: { $set: { reason: clean(b.reason), source: 'import', active: true }, $setOnInsert: { bannedAt: new Date() } },
            upsert: true,
          },
        });
      }
      if (ops.length) await NetworkBan.bulkWrite(ops, { ordered: false });
      imported += ops.length;
      if (bans.size < 1000) break;
      after = [...bans.keys()].reduce((a, b) => (BigInt(a) > BigInt(b) ? a : b));
    }
    return { ok: true, imported };
  } catch (err) {
    return { ok: false, imported, error: err.message };
  }
}

/** This person's bans elsewhere in the network, one per server, newest first. */
export async function networkBansFor(client, userId, exceptGuildId) {
  const [bans, ids] = await Promise.all([
    NetworkBan.find({ userId, active: true, guildId: { $ne: exceptGuildId } }).lean(),
    sharingGuilds(),
  ]);
  const out = [];
  const seen = new Set();
  for (const b of bans) {
    if (seen.has(b.guildId) || !ids.has(b.guildId)) continue;
    const g = client?.guilds?.cache?.get(b.guildId);
    if (!g || (g.memberCount || 0) < NETWORK_MIN_MEMBERS) continue;
    seen.add(b.guildId);
    out.push({ reason: b.reason, bannedAt: b.bannedAt, members: g.memberCount });
  }
  return out.sort((a, b) => new Date(b.bannedAt) - new Date(a.bannedAt));
}

function alertEmbed(user, bans, { autoBanned = false } = {}) {
  const reasons = bans.slice(0, 5).map((b) =>
    '> ' + (b.reason || 'No reason given') + '\n-# A server with ' + b.members + ' members, <t:' + unix(b.bannedAt) + ':R>');
  if (bans.length > 5) reasons.push('-# and ' + (bans.length - 5) + ' more');
  return new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('Safety Network warning')
    .setDescription(
      '**' + (user.username || 'Someone') + '** (<@' + user.id + '>) just joined. They are banned in **' + bans.length + '** other ' +
      (bans.length === 1 ? 'server' : 'servers') + ' in the RolePlayManager Safety Network.\n\n' +
      '**Reasons given**\n' + reasons.join('\n') + '\n\n' +
      'Account created <t:' + unix(user.createdTimestamp || Date.now()) + ':R>. User ID ' + user.id +
      (autoBanned ? '\n\n**Banned automatically**, by this server\'s Safety Network setting.' : '')
    )
    .setFooter({ text: 'RPM · Safety Network · A warning is not proof. Check before you act.' });
}

/** guildMemberAdd: warn staff, and ban if a Premium server asked for that. */
export async function checkJoin(member) {
  if (!member?.guild || member.user?.bot) return null;
  const cfg = await SafetyNetworkConfig.findOne({ guildId: member.guild.id, alerts: true }).lean();
  if (!cfg?.alertChannelId) return null;
  const bans = await networkBansFor(member.client, member.id, member.guild.id);
  if (!bans.length) return null;

  let autoBanned = false;
  if (cfg.autoBanAt > 0 && bans.length >= cfg.autoBanAt && member.bannable && await hasPremiumAccess(member.guild.id)) {
    try {
      await member.ban({ reason: NETWORK_REASON + ': banned in ' + bans.length + ' other servers' });
      autoBanned = true;
    } catch {}
  }

  const channel = member.guild.channels.cache.get(cfg.alertChannelId);
  if (channel?.isTextBased?.()) {
    const payload = { embeds: [alertEmbed(member.user, bans, { autoBanned })], allowedMentions: { parse: [] } };
    if (!autoBanned) {
      payload.components = [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('safenet_ban_' + member.id).setLabel('Ban').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('safenet_kick_' + member.id).setLabel('Kick').setStyle(ButtonStyle.Secondary),
      )];
    }
    await channel.send(payload).catch(() => {});
  }
  return { bans: bans.length, autoBanned };
}

/** The Ban and Kick buttons on a warning. */
export async function handleAlertButton(interaction) {
  const [, action, userId] = interaction.customId.split('_');
  const perm = action === 'ban' ? PermissionFlagsBits.BanMembers : PermissionFlagsBits.KickMembers;
  if (!interaction.memberPermissions?.has(perm)) {
    return interaction.reply({ content: 'You need the ' + (action === 'ban' ? 'Ban' : 'Kick') + ' Members permission for that.', flags: 64 });
  }
  const why = NETWORK_REASON + ': ' + (action === 'ban' ? 'banned' : 'kicked') + ' by ' + interaction.user.username + ' after a network warning';
  try {
    if (action === 'ban') {
      await interaction.guild.members.ban(userId, { reason: why });
    } else {
      const m = await interaction.guild.members.fetch(userId).catch(() => null);
      if (!m) return interaction.reply({ content: 'They are not in the server any more.', flags: 64 });
      await m.kick(why);
    }
  } catch {
    return interaction.reply({ content: 'The bot could not do that. Check it has the permission and that its role is above theirs.', flags: 64 });
  }
  const embed = EmbedBuilder.from(interaction.message.embeds[0])
    .addFields({ name: action === 'ban' ? 'Banned' : 'Kicked', value: 'by <@' + interaction.user.id + '> <t:' + unix(Date.now()) + ':R>' });
  return interaction.update({ embeds: [embed], components: [], allowedMentions: { parse: [] } });
}
