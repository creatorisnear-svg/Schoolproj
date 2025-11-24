import { SlashCommandBuilder } from 'discord.js';
import RoleplayCommands from '../models/RoleplayCommands.js';
import { errorEmbed, successEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('toggleroleplaycommands')
  .setDescription('Enable or disable the roleplay commands system (Staff only)');

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. This is a staff-only command.')],
      ephemeral: true,
    });
  }

  try {
    let roleplayConfig = await RoleplayCommands.findOne({ guildId: interaction.guildId });

    if (!roleplayConfig) {
      roleplayConfig = new RoleplayCommands({ guildId: interaction.guildId, enabled: true });
      await roleplayConfig.save();

      return interaction.reply({
        embeds: [successEmbed('Roleplay Commands Enabled', 'Members now have access to roleplay commands. Run `/roleplaycommandsetup` to configure.')],
        ephemeral: true,
      });
    }

    roleplayConfig.enabled = !roleplayConfig.enabled;
    await roleplayConfig.save();

    const status = roleplayConfig.enabled ? 'enabled' : 'disabled';
    const message = roleplayConfig.enabled
      ? 'Members now have access to roleplay commands.'
      : 'Members no longer have access to roleplay commands.';

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
