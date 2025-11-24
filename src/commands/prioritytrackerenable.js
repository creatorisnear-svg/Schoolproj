import { SlashCommandBuilder } from 'discord.js';
import Priority from '../models/Priority.js';
import Config from '../models/Config.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';
import { isAdmin } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('prioritytrackerenable')
  .setDescription('Enable or disable the priority tracker system (Admin only)')
  .addBooleanOption(option =>
    option
      .setName('enabled')
      .setDescription('Enable or disable the priority tracker')
      .setRequired(true)
  );

export async function execute(interaction) {
  if (!await isAdmin(interaction.member)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. Only administrators can manage the priority tracker system.')],
      ephemeral: true,
    });
  }

  const enabled = interaction.options.getBoolean('enabled');

  try {
    const config = await Config.findOne({ guildId: interaction.guildId });

    if (enabled && (!config || !config.logChannelId)) {
      return interaction.reply({
        embeds: [errorEmbed('You must set a log channel first using `/setlogchannel` before enabling the priority tracker.')],
        ephemeral: true,
      });
    }

    let priority = await Priority.findOne({ guildId: interaction.guildId }) || new Priority({ guildId: interaction.guildId });
    
    priority.enabled = enabled;
    await priority.save();

    const status = enabled ? 'enabled' : 'disabled';
    const message = enabled 
      ? 'The priority tracker system has been enabled. Use `/prioritytrackersetup` to configure it.'
      : 'The priority tracker system has been disabled.';

    return interaction.reply({
      embeds: [successEmbed(`Priority Tracker ${status.toUpperCase()}`, message)],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error toggling priority tracker:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while toggling the priority tracker.')],
      ephemeral: true,
    });
  }
}
