import { SlashCommandBuilder } from 'discord.js';
import { StrikeConfig } from '../models/Strike.js';
import Config from '../models/Config.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';
import { isAdmin } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('enablestrikesystem')
  .setDescription('Enable or disable the strike system')
  .addBooleanOption(option =>
    option
      .setName('enabled')
      .setDescription('Enable or disable the strike system')
      .setRequired(true)
  );

export async function execute(interaction) {
  if (!await isAdmin(interaction.member)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. Only administrators can manage the strike system.')],
      ephemeral: true,
    });
  }

  const enabled = interaction.options.getBoolean('enabled');

  try {
    const config = await Config.findOne({ guildId: interaction.guildId });

    if (enabled && (!config || !config.logChannelId)) {
      return interaction.reply({
        embeds: [errorEmbed('You must set a log channel first using `/setlogchannel` before enabling the strike system.')],
        ephemeral: true,
      });
    }

    let strikeConfig = await StrikeConfig.findOne({ guildId: interaction.guildId }) || new StrikeConfig({ guildId: interaction.guildId });
    
    strikeConfig.enabled = enabled;
    await strikeConfig.save();

    const status = enabled ? 'enabled' : 'disabled';
    const message = enabled 
      ? 'The strike system has been enabled. Use `/strikesystemsetup` to configure it.'
      : 'The strike system has been disabled. Members can no longer receive strikes.';

    return interaction.reply({
      embeds: [successEmbed(`Strike System ${status.charAt(0).toUpperCase() + status.slice(1)}`, message)],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error toggling strike system:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while updating the strike system.')],
      ephemeral: true,
    });
  }
}
