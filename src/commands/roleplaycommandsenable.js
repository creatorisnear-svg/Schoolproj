import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import RoleplayCommands from '../models/RoleplayCommands.js';
import Config from '../models/Config.js';
import { errorEmbed, successEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('roleplaycommandsenable')
  .setDescription('Enable or disable roleplay commands (Staff only)');

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. This is a staff-only command.')],
      ephemeral: true,
    });
  }

  try {
    const config = await Config.findOne({ guildId: interaction.guildId });

    if (!config || !config.logChannelId) {
      return interaction.reply({
        embeds: [errorEmbed('A log channel must be configured first. Run `/setlogchannel`.')],
        ephemeral: true,
      });
    }

    let roleplayConfig = await RoleplayCommands.findOne({ guildId: interaction.guildId });

    if (!roleplayConfig) {
      roleplayConfig = new RoleplayCommands({ guildId: interaction.guildId, enabled: true });
      await roleplayConfig.save();

      return interaction.reply({
        embeds: [successEmbed('Roleplay Commands Enabled', 'Roleplay commands system is now enabled. Run `/roleplaycommandsetup` to configure.')],
        ephemeral: true,
      });
    }

    const menu = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('roleplaycommandsenable_menu')
          .setPlaceholder('Choose an option...')
          .addOptions(
            { label: '✅ Enable Roleplay Commands', value: 'enable', description: roleplayConfig.enabled ? '(Currently enabled)' : '' },
            { label: '❌ Disable Roleplay Commands', value: 'disable', description: !roleplayConfig.enabled ? '(Currently disabled)' : '' }
          )
      );

    await interaction.reply({
      content: '**Roleplay Commands**\n\nChoose to enable or disable:',
      components: [menu],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error in roleplay commands enable:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}
