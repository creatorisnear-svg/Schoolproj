import { SlashCommandBuilder } from 'discord.js';
import Verification from '../models/Verification.js';
import { successEmbed, errorEmbed, infoEmbed } from '../utils/embedBuilder.js';
import { isAdmin } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('verifysystem')
  .setDescription('Enable or disable the verification system')
  .addBooleanOption(option =>
    option
      .setName('enabled')
      .setDescription('Enable or disable the verification system')
      .setRequired(true)
  );

export async function execute(interaction) {
  if (!await isAdmin(interaction.member)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. Only administrators can manage the verification system.')],
      ephemeral: true,
    });
  }

  const enabled = interaction.options.getBoolean('enabled');

  try {
    let verification = await Verification.findOne({ guildId: interaction.guildId }) || new Verification({ guildId: interaction.guildId });
    
    verification.enabled = enabled;
    await verification.save();

    const status = enabled ? 'enabled' : 'disabled';
    const message = enabled 
      ? 'The verification system has been enabled. Use `/verifysystemsetup` to configure it.'
      : 'The verification system has been disabled. Members will no longer be able to verify.';

    return interaction.reply({
      embeds: [successEmbed(`Verification System ${status.charAt(0).toUpperCase() + status.slice(1)}`, message)],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error toggling verification system:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while updating the verification system.')],
      ephemeral: true,
    });
  }
}
