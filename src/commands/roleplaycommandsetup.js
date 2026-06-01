import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import RoleplayCommands from '../models/RoleplayCommands.js';
import { errorEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';
import { checkFeatureAccess, buildPremiumEmbed } from '../utils/premiumCheck.js';

export const data = new SlashCommandBuilder()
  .setName('roleplaycommandsetup')
  .setDescription('Setup the roleplay commands system (Admin/Staff)');

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. This is a staff-only command.')],
      flags: 64,
    });
  }

  const access = await checkFeatureAccess(interaction.guildId, 'roleplay');
  if (!access.allowed) {
    return interaction.reply({
      embeds: [buildPremiumEmbed('Roleplay Commands')],
      flags: 64,
    });
  }

  try {
    const roleplayConfig = await RoleplayCommands.findOne({ guildId: interaction.guildId });

    if (!roleplayConfig || !roleplayConfig.enabled) {
      return interaction.reply({
        embeds: [errorEmbed('Roleplay Commands Not Enabled', 'Use `/enablecommands` → Enable Features → Roleplay Commands')],
        flags: 64,
      });
    }

    const menu = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('roleplaycommands_setup_menu')
          .setPlaceholder('Choose a command to configure...')
          .addOptions(
            { label: '911 & CAD - Emergency/Dispatch', value: 'setup_emergency' },
            { label: 'Twitter - Public Messages', value: 'setup_twitter' },
            { label: 'Anon - Anonymous Messages', value: 'setup_anon' },
            { label: 'Done - Close Setup', value: 'setup_done' }
          )
      );

    await interaction.reply({
      content: '**Roleplay Commands Setup**\n\nSelect a command to configure:',
      components: [menu],
      flags: 64,
    });
  } catch (error) {
    console.error('Error in roleplay commands setup:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      flags: 64,
    });
  }
}
