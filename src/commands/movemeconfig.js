import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } from 'discord.js';
import { checkStaffPermission } from '../utils/permissions.js';
import { errorEmbed } from '../utils/embedBuilder.js';
import MemberMovementConfig from '../models/MemberMovementConfig.js';
import { checkFeatureAccess, buildPremiumEmbed } from '../utils/premiumCheck.js';

export const data = new SlashCommandBuilder()
  .setName('movemeconfig')
  .setDescription('Configure the Voice Mover system (Admin/Staff)');

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. This is a staff-only command.')],
      flags: 64,
    });
  }

  const access = await checkFeatureAccess(interaction.guildId, 'membermovement');
  if (!access.allowed) {
    return interaction.reply({
      embeds: [buildPremiumEmbed('Member Movement')],
      flags: 64,
    });
  }

  const config = await MemberMovementConfig.findOne({ guildId: interaction.guildId });

  if (!config?.enabled) {
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor('#ed4245')
        .setTitle('Voice Mover is Disabled')
        .setDescription(
          'Voice Mover must be enabled before running setup.\n\n' +
          '**To enable it:**\n' +
          '`1.` Run `/enablecommands` → **Enable Features** → **Member Movement**\n' +
          '`2.` Or toggle it on in the **Dashboard → Voice Mover** settings page'
        )
        .setFooter({ text: 'RPM' })],
      flags: 64,
    });
  }

  const chCount = (config.allowedChannelIds || []).length;
  const panelStatus = config.panelChannelId
    ? `Panel channel: <#${config.panelChannelId}>${config.panelMessageId ? ' - panel active' : ' - not sent yet'}`
    : 'No panel channel set';

  const menu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('movemesetup_menu')
      .setPlaceholder('Choose a setup option...')
      .addOptions([
        { label: 'Add Allowed Channel', description: 'Restrict the panel to specific voice channels', value: 'add_channel' },
        { label: 'Remove Allowed Channel', description: 'Remove a channel from the allowed list', value: 'remove_channel' },
        { label: 'View Allowed Channels', description: 'See which channels are currently allowed', value: 'view_channels' },
        { label: 'Clear Channel Filter', description: 'Allow all voice channels in the panel', value: 'clear_filter' },
        { label: 'Send Panel', description: 'Post the voice mover panel to a text channel', value: 'send_panel' },
        { label: 'Done - Close Setup', description: 'Close this setup menu', value: 'setup_done' },
      ])
  );

  return interaction.reply({
    content: `**Voice Mover Setup**\n\n${panelStatus}\nAllowed channels: ${chCount > 0 ? chCount + ' configured' : 'all channels (no filter set)'}\n\nSelect an option below to configure:`,
    components: [menu],
    flags: 64,
  });
}
