import { SlashCommandBuilder } from 'discord.js';
import Config from '../models/Config.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';
import { isAdmin } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('antipromotingenable')
  .setDescription('Enable or disable anti-promoting system (Admin only)')
  .addBooleanOption(option =>
    option
      .setName('enabled')
      .setDescription('Enable or disable anti-promoting')
      .setRequired(true)
  );

export async function execute(interaction) {
  if (!await isAdmin(interaction.member)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. Only administrators can manage the anti-promoting system.')],
      ephemeral: true,
    });
  }

  const enabled = interaction.options.getBoolean('enabled');

  try {
    let config = await Config.findOne({ guildId: interaction.guildId }) || new Config({ guildId: interaction.guildId });

    if (enabled && !config.logChannelId) {
      return interaction.reply({
        embeds: [errorEmbed('You must set a log channel first using `/setlogchannel` before enabling anti-promoting.')],
        ephemeral: true,
      });
    }

    config.antiPromotingEnabled = enabled;
    await config.save();

    const status = enabled ? 'enabled' : 'disabled';
    const description = enabled 
      ? 'Anti-promoting system has been enabled. Invite links will be monitored and logged to the configured log channel.'
      : 'Anti-promoting system has been disabled.';

    return interaction.reply({
      embeds: [successEmbed(`Anti-Promoting ${status.toUpperCase()}`, description)],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error toggling anti-promoting:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while toggling anti-promoting.')],
      ephemeral: true,
    });
  }
}
