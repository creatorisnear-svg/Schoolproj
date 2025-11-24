import { SlashCommandBuilder } from 'discord.js';
import RoleplayCommands from '../models/RoleplayCommands.js';
import { errorEmbed, successEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('roleplaycommandsenable')
  .setDescription('Enable the roleplay commands system (Staff only)');

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. This is a staff-only command.')],
      ephemeral: true,
    });
  }

  try {
    // Check if log channel is set
    const { default: Config } = await import('../models/Config.js');
    const config = await Config.findOne({ guildId: interaction.guildId });

    if (!config || !config.logChannelId) {
      return interaction.reply({
        embeds: [errorEmbed('You must set a log channel first using `/setlogchannel`.')],
        ephemeral: true,
      });
    }

    // Create or update roleplay commands config
    let roleplayConfig = await RoleplayCommands.findOne({ guildId: interaction.guildId });

    if (!roleplayConfig) {
      roleplayConfig = new RoleplayCommands({
        guildId: interaction.guildId,
        enabled: true,
      });
    } else {
      roleplayConfig.enabled = true;
    }

    await roleplayConfig.save();

    return interaction.reply({
      embeds: [successEmbed('Roleplay Commands Enabled', 'The roleplay commands system is now enabled. Run `/roleplaycommandsetup` to configure commands.')],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error enabling roleplay commands:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}
