import { SlashCommandBuilder } from 'discord.js';
import RoleplayCalendar from '../models/RoleplayCalendar.js';
import Config from '../models/Config.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';
import { isAdmin } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('roleplaycalendarenable')
  .setDescription('Enable or disable the roleplay calendar system (Admin only)')
  .addBooleanOption(option =>
    option
      .setName('enabled')
      .setDescription('Enable or disable the roleplay calendar')
      .setRequired(true)
  );

export async function execute(interaction) {
  if (!await isAdmin(interaction.member)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. Only administrators can manage the roleplay calendar system.')],
      ephemeral: true,
    });
  }

  const enabled = interaction.options.getBoolean('enabled');

  try {
    const config = await Config.findOne({ guildId: interaction.guildId });

    if (enabled && (!config || !config.logChannelId)) {
      return interaction.reply({
        embeds: [errorEmbed('You must set a log channel first using `/setlogchannel` before enabling the roleplay calendar.')],
        ephemeral: true,
      });
    }

    let calendar = await RoleplayCalendar.findOne({ guildId: interaction.guildId }) || new RoleplayCalendar({ guildId: interaction.guildId });
    
    calendar.enabled = enabled;
    await calendar.save();

    const status = enabled ? 'enabled' : 'disabled';
    const message = enabled 
      ? 'The roleplay calendar system has been enabled. Use `/roleplaycalendersetup` to configure it.'
      : 'The roleplay calendar system has been disabled.';

    return interaction.reply({
      embeds: [successEmbed(`Roleplay Calendar ${status.toUpperCase()}`, message)],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error toggling roleplay calendar:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while toggling the roleplay calendar.')],
      ephemeral: true,
    });
  }
}
