import { SlashCommandBuilder } from 'discord.js';
import Welcome from '../models/Welcome.js';
import Config from '../models/Config.js';
import { successEmbed, errorEmbed, infoEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('welcomesystem')
  .setDescription('Enable or disable the welcome system (Admin/Staff)')
  .addBooleanOption(option =>
    option
      .setName('enabled')
      .setDescription('Enable or disable the welcome system')
      .setRequired(true)
  );

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. Only staff can manage the welcome system.')],
      ephemeral: true,
    });
  }

  const enabled = interaction.options.getBoolean('enabled');

  try {
    const config = await Config.findOne({ guildId: interaction.guildId });

    if (enabled && (!config || !config.logChannelId)) {
      return interaction.reply({
        embeds: [errorEmbed('You must set a log channel first using `/setlogchannel` before enabling the welcome system.')],
        ephemeral: true,
      });
    }

    let welcome = await Welcome.findOne({ guildId: interaction.guildId }) || new Welcome({ guildId: interaction.guildId });
    
    welcome.enabled = enabled;
    await welcome.save();

    const status = enabled ? 'enabled' : 'disabled';
    const message = enabled 
      ? 'The welcome system has been enabled. Use `/welcomesystemsetup` to configure it.'
      : 'The welcome system has been disabled. New members will no longer receive welcome messages.';

    return interaction.reply({
      embeds: [successEmbed(`Welcome System ${status.charAt(0).toUpperCase() + status.slice(1)}`, message)],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error toggling welcome system:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while updating the welcome system.')],
      ephemeral: true,
    });
  }
}
