import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { checkStaffPermission } from '../utils/permissions.js';
import { checkFeatureAccess } from '../utils/premiumCheck.js';
import AppyConfig from '../models/AppyConfig.js';
import AppyPanel from '../models/AppyPanel.js';

export const data = new SlashCommandBuilder()
  .setName('appyconfig')
  .setDescription('View and manage the Applications system (Admin/Staff)');

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor('#2d2d2d')
          .setDescription('You do not have permission to use this command.')
          .setFooter({ text: 'RPM' }),
      ],
      flags: 64,
    });
  }

  const access = await checkFeatureAccess(interaction.guildId, 'appys');
  if (!access.allowed) {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor('#2d2d2d')
          .setTitle('Premium Required')
          .setDescription('The Applications system requires a premium key.\n\nActivate one with `/activatepremium` or purchase at `roleplaymanager.xyz`.')
          .setFooter({ text: 'RPM' }),
      ],
      flags: 64,
    });
  }

  let config, types;
  try {
    config = await AppyConfig.findOne({ guildId: interaction.guildId });
    types = await AppyPanel.find({ guildId: interaction.guildId }).sort({ createdAt: 1 });
  } catch (err) {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor('#2d2d2d')
          .setDescription('Failed to load Applications config.')
          .setFooter({ text: 'RPM' }),
      ],
      flags: 64,
    });
  }

  const enabled = config?.enabled ?? false;
  const reviewChannelId = config?.reviewChannelId;
  const panelChannelId = config?.panelChannelId;
  const typeCount = types?.length ?? 0;

  const typeList = typeCount > 0
    ? types.map(t =>
        `- **${t.name}** — ${t.questions?.length ?? 0} question${(t.questions?.length ?? 0) === 1 ? '' : 's'}` +
        (t.acceptRoleId ? ` | Accept role: <@&${t.acceptRoleId}>` : '')
      ).join('\n')
    : '-# No application types configured yet. Use the dashboard to create some.';

  const lines = [
    `### Status\n${enabled ? '`Enabled`' : '`Disabled`'}`,
    `### Panel Channel\n${panelChannelId ? `<#${panelChannelId}>` : '-# Not set'}`,
    `### Review Channel\n${reviewChannelId ? `<#${reviewChannelId}>` : '-# Not set — applications have nowhere to go'}`,
    `### Application Types (${typeCount})\n${typeList}`,
    `-# Configure via the dashboard at \`roleplaymanager.xyz\` · or use \`/config appys\` for a quick overview`,
  ];

  const embed = new EmbedBuilder()
    .setColor('#2d2d2d')
    .setTitle('Applications Config')
    .setDescription(lines.join('\n\n'))
    .setFooter({ text: 'RPM' });

  return interaction.reply({ embeds: [embed], flags: 64 });
}
