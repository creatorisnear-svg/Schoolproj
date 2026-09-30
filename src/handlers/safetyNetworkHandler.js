import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  ChannelSelectMenuBuilder, ChannelType, PermissionFlagsBits,
} from 'discord.js';
import SafetyNetworkConfig from '../models/SafetyNetworkConfig.js';
import NetworkBan from '../models/NetworkBan.js';
import { backRow } from '../utils/setupNav.js';
import { hasPremiumAccess } from '../utils/premiumCheck.js';
import {
  AUTOBAN_CHOICES, NETWORK_MIN_MEMBERS,
  importBans, forgetSharingCache, handleAlertButton, networkSize,
} from '../utils/safetyNetwork.js';

/**
 * The Safety Network screen inside /setup, and every safenet_ component:
 * the settings here, and the Ban and Kick buttons on warnings.
 */

export async function safetyNetworkView(guild, note = '') {
  const cfg = (await SafetyNetworkConfig.findOne({ guildId: guild.id }).lean()) || {};
  const [size, shared] = await Promise.all([
    networkSize(guild.client),
    NetworkBan.countDocuments({ guildId: guild.id, active: true }),
  ]);

  const lines = [];
  if (note) lines.push(note, '');
  lines.push(
    'Trolls and raiders move from one console RP server to the next. Servers in the Safety Network share their bans, so when someone banned elsewhere joins yours, your staff hear about it first.',
    '',
    '**Share your bans.** When you ban someone, the reason is shared as a warning with the other servers. They never see which server it was.',
    '**Get warnings.** When someone banned in other network servers joins, the bot posts the reasons in the channel you pick, with buttons to ban or kick.',
    'Nobody is banned automatically unless you turn that on, which is part of Premium.',
    '',
    '**This server**',
    'Sharing bans: ' + (cfg.share ? 'on, ' + shared + ' shared' : 'off'),
    'Warnings: ' + (cfg.alerts && cfg.alertChannelId ? 'on, in <#' + cfg.alertChannelId + '>' : 'off'),
    'Automatic bans: ' + (cfg.autoBanAt ? 'at ' + cfg.autoBanAt + ' or more servers' : 'off'),
    '',
    '**The network:** ' + size + (size === 1 ? ' server shares' : ' servers share') + ' their bans.',
    '-# Only servers with ' + NETWORK_MIN_MEMBERS + ' or more members count, and an unban withdraws the warning.',
  );

  const embed = new EmbedBuilder()
    .setColor(0x2d2d2d)
    .setTitle('Safety Network')
    .setDescription(lines.join('\n').slice(0, 4000))
    .setFooter({ text: 'RPM · Pick a channel only your staff can see' });

  const channelMenu = new ChannelSelectMenuBuilder()
    .setCustomId('safenet_channel')
    .setPlaceholder('Channel for warnings')
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setMinValues(1)
    .setMaxValues(1);
  if (cfg.alertChannelId && guild.channels.cache.has(cfg.alertChannelId)) channelMenu.setDefaultChannels(cfg.alertChannelId);

  const autoBan = new StringSelectMenuBuilder()
    .setCustomId('safenet_autoban')
    .setPlaceholder('Automatic bans')
    .addOptions(
      { label: 'Automatic bans: off', value: '0', default: !cfg.autoBanAt },
      ...AUTOBAN_CHOICES.map((n) => ({
        label: 'Ban automatically at ' + n + ' or more servers',
        description: 'Premium',
        value: String(n),
        default: cfg.autoBanAt === n,
      })),
    );

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(channelMenu),
      new ActionRowBuilder().addComponents(autoBan),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('safenet_share')
          .setLabel(cfg.share ? 'Stop sharing my bans' : 'Share my bans')
          .setStyle(cfg.share ? ButtonStyle.Secondary : ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('safenet_alerts')
          .setLabel(cfg.alerts ? 'Turn warnings off' : 'Turn warnings on')
          .setStyle(cfg.alerts ? ButtonStyle.Secondary : ButtonStyle.Primary),
      ),
      backRow(),
    ],
  };
}

export async function handleSafetyNetwork(interaction) {
  const id = interaction.customId;
  if (id.startsWith('safenet_ban_') || id.startsWith('safenet_kick_')) return handleAlertButton(interaction);
  if (!interaction.inGuild()) return;
  // Bans are serious: the settings need Manage Server, not just a staff role.
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({ content: 'Only members with the Manage Server permission can change the Safety Network.', flags: 64 });
  }

  const guild = interaction.guild;
  const cfg = await SafetyNetworkConfig.findOne({ guildId: guild.id }) || new SafetyNetworkConfig({ guildId: guild.id });
  let note = '';

  if (id === 'safenet_share') {
    cfg.share = !cfg.share;
    if (cfg.share) {
      // Reading a long ban list can take longer than Discord waits.
      await interaction.deferUpdate();
      const r = await importBans(guild);
      cfg.importedAt = new Date();
      note = r.ok
        ? '**Sharing on.** ' + r.imported + (r.imported === 1 ? ' ban' : ' bans') + ' already on this server are shared now, and new bans will be too.'
        : '**Sharing on.** New bans will be shared. The bot could not read your existing ban list: give it the Ban Members permission, then turn sharing off and on to bring them in.';
    } else {
      note = '**Sharing off.** Your bans no longer count for other servers.';
    }
    forgetSharingCache();
  } else if (id === 'safenet_alerts') {
    if (!cfg.alerts && !cfg.alertChannelId) {
      note = 'Pick a channel for warnings first, in the menu above.';
    } else {
      cfg.alerts = !cfg.alerts;
      note = cfg.alerts ? '**Warnings on.**' : '**Warnings off.**';
    }
  } else if (id === 'safenet_channel') {
    cfg.alertChannelId = interaction.values?.[0] || null;
    cfg.alerts = !!cfg.alertChannelId;
    if (cfg.alertChannelId) note = '**Warnings on,** in <#' + cfg.alertChannelId + '>.';
  } else if (id === 'safenet_autoban') {
    const n = Number(interaction.values?.[0]) || 0;
    if (n && !(await hasPremiumAccess(guild.id))) {
      note = 'Automatic bans are part of Premium. Warnings, and the buttons to ban or kick, stay free. Run `/premium` to try it.';
    } else {
      cfg.autoBanAt = AUTOBAN_CHOICES.includes(n) ? n : 0;
      note = cfg.autoBanAt
        ? '**Automatic bans on** for anyone banned in ' + cfg.autoBanAt + ' or more network servers. Warnings need to be on for this to work.'
        : '**Automatic bans off.**';
    }
  }

  cfg.updatedBy = interaction.user.id;
  cfg.updatedAt = new Date();
  await cfg.save();

  const view = await safetyNetworkView(guild, note);
  return interaction.deferred ? interaction.editReply(view) : interaction.update(view);
}
