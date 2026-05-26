import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import Verification from '../models/Verification.js';
import Config from '../models/Config.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';
import { checkFeatureAccess } from '../utils/premiumCheck.js';

export const data = new SlashCommandBuilder()
  .setName('verifysystemsetup')
  .setDescription('Configure the verification system for your server (Admin/Staff)');

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. Only staff can set up the verification system.')],
      flags: 64,
    });
  }

  const access = await checkFeatureAccess(interaction.guildId, 'verification');
  if (!access.allowed) {
    return interaction.reply({
      embeds: [errorEmbed('Premium Required', 'Verification System is a **Premium** feature.\nUse `/activatepremium` with a valid key to unlock it.')],
      flags: 64,
    });
  }

  const config = await Config.findOne({ guildId: interaction.guildId });

  if (!config || !config.logChannelId) {
    return interaction.reply({
      embeds: [errorEmbed('You must set a log channel first using `/setlogchannel` before setting up the verification system.')],
      flags: 64,
    });
  }

  const verification = await Verification.findOne({ guildId: interaction.guildId });
  
  if (!verification || !verification.enabled) {
    return interaction.reply({
      embeds: [errorEmbed('Verification System Not Enabled', 'Use `/enablecommands` → Enable Features → Verification System')],
      flags: 64,
    });
  }

  const steps = [
    { id: 'select_verify_channel', label: 'Select Verify Channel (Required)' },
    { id: 'select_verified_role', label: 'Select Verified Role (Required)' },
    { id: 'select_unverified_role', label: 'Select Unverified Role (Required)' },
    { id: 'select_verified_channels', label: 'Select Verified Channels (Required)' },
    { id: 'set_custom_question', label: 'Set Custom Question (Optional)' },
    { id: 'delete_custom_question', label: 'Delete Custom Question (Optional)' },
    { id: 'toggle_approval_required', label: 'Toggle Approval Required (Optional)' },
    { id: 'set_rp_tag', label: 'Set RP Tag (Optional)' },
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
    content: '**Verification System Setup**\n\nSet the verify channel, verified role, unverified role, and which categories verified members can see.\n\n**Verified Members** will see: All channels in selected categories + welcome channel\n**Unverified Members** will see: Verify channel + welcome channel',
    components: [menu],
    flags: 64,
  });
}
