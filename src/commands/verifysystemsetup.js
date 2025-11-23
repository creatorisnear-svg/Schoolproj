import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import Verification from '../models/Verification.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';
import { isAdmin } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('verifysystemsetup')
  .setDescription('Configure the verification system for your server');

export async function execute(interaction) {
  if (!await isAdmin(interaction.member)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. Only administrators can set up the verification system.')],
      ephemeral: true,
    });
  }

  const steps = [
    { id: 'select_verify_channel', label: 'Select Verify Channel' },
    { id: 'select_welcome_channel', label: 'Select Welcome Channel' },
    { id: 'select_unverified_role', label: 'Select Unverified Role' },
    { id: 'select_verified_role', label: 'Select Verified Role' },
    { id: 'set_rp_tag', label: 'Set RP Tag (Required)' },
    { id: 'set_custom_question', label: 'Set Custom Question (Optional)' },
    { id: 'set_dm_message', label: 'Set DM Message (Optional)' },
  ];

  const menu = new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('verify_setup_menu')
        .setPlaceholder('Choose a setup option...')
        .addOptions(
          steps.map(step => ({
            label: step.label,
            value: step.id,
            description: `Configure ${step.label.toLowerCase()}`,
          }))
        )
    );

  return interaction.reply({
    content: '**Verification System Setup**\n\nSelect an option below to configure your verification system:',
    components: [menu],
    ephemeral: true,
  });
}
