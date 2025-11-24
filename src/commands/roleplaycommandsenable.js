import { SlashCommandBuilder } from 'discord.js';
import RoleplayCommands from '../models/RoleplayCommands.js';
import Config from '../models/Config.js';
import { errorEmbed, successEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('roleplaycommandsenable')
  .setDescription('Enable or disable roleplay commands (Staff only)')
  .addBooleanOption(option =>
    option
      .setName('enabled')
      .setDescription('Enable or disable roleplay commands')
      .setRequired(true)
  );

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. This is a staff-only command.')],
      ephemeral: true,
    });
  }

  const enabled = interaction.options.getBoolean('enabled');

  try {
    if (enabled) {
      const config = await Config.findOne({ guildId: interaction.guildId });

      if (!config || !config.logChannelId) {
        return interaction.reply({
          embeds: [errorEmbed('A log channel must be configured first. Run `/setlogchannel`.')],
          ephemeral: true,
        });
      }
    }

    let roleplayConfig = await RoleplayCommands.findOne({ guildId: interaction.guildId }) || new RoleplayCommands({ guildId: interaction.guildId });

    roleplayConfig.enabled = enabled;
    await roleplayConfig.save();

    const status = enabled ? 'enabled' : 'disabled';
    const message = enabled
      ? 'Roleplay commands system is now enabled. Run `/roleplaycommandsetup` to configure.'
      : 'Roleplay commands system has been disabled.';

    return interaction.reply({
      embeds: [successEmbed(`Roleplay Commands ${status.charAt(0).toUpperCase() + status.slice(1)}`, message)],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error toggling roleplay commands:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}
