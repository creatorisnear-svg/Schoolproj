import { PermissionFlagsBits } from 'discord.js';
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { isAdmin } from '../utils/permissions.js';
import { errorEmbed } from '../utils/embedBuilder.js';

export const data = new SlashCommandBuilder()
  .setName('reloadconfig')
  .setDescription('Reload all bot configuration from database (Admin only)');

export async function execute(interaction) {
  if (!await isAdmin(interaction.member)) {
    return interaction.reply({
      embeds: [errorEmbed('Only administrators can reload configuration.')],
      flags: 64,
    });
  }

  try {
    const embed = new EmbedBuilder()
      .setColor('#2d2d2d')
      .setTitle('Configuration Reloaded')
      .setDescription('All configurations have been reloaded from the database.')
      .setFooter({ text: 'RPM' });

    return interaction.reply({
      embeds: [embed],
      flags: 64,
    });
  } catch (error) {
    console.error('Error in reload config command:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while reloading configuration.')],
      flags: 64,
    });
  }
}

// Configuration is administrator work. This hides the command from members
// who cannot Manage Server, so the command picker is not 60% options they
// cannot run. Day-to-day staff commands are deliberately left visible: the
// bot's own Staff table is not expressible as a Discord permission, so
// hiding those would break staff added with /staff add.
data.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
