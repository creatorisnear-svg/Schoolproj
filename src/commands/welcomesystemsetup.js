import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import { errorEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';
import Welcome from '../models/Welcome.js';
import Config from '../models/Config.js';

export const data = new SlashCommandBuilder()
  .setName('welcomesystemsetup')
  .setDescription('Configure the welcome system for new members (Admin/Staff)');

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. This is a staff-only command.')],
      ephemeral: true,
    });
  }

  const config = await Config.findOne({ guildId: interaction.guildId });

  if (!config || !config.logChannelId) {
    return interaction.reply({
      embeds: [errorEmbed('You must set a log channel first using `/setlogchannel` before setting up the welcome system.')],
      ephemeral: true,
    });
  }

  const welcome = await Welcome.findOne({ guildId: interaction.guildId });
  
  if (!welcome || !welcome.enabled) {
    return interaction.reply({
      embeds: [errorEmbed('⚙️ Welcome System Not Enabled', 'Use `/enablecommands` → Enable Features → Welcome System')],
      ephemeral: true,
    });
  }

  const steps = [
    { id: 'select_welcome_channel_setup', label: 'Select Welcome Channel' },
    { id: 'set_welcome_message_setup', label: 'Set Welcome Message' },
    { id: 'set_welcome_dm_setup', label: 'Set Welcome DM' },
  ];

  const menu = new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('welcome_setup_menu')
        .setPlaceholder('Choose a setup option...')
        .addOptions(
          steps.map(step => ({
            label: step.label,
            value: step.id,
            description: `Configure ${step.label.toLowerCase()}`,
          }))
        )
    );

  return interaction.reply({
    content: '**Welcome System Setup**\n\nSelect an option below to configure your welcome system:',
    components: [menu],
    ephemeral: true,
  });
}
