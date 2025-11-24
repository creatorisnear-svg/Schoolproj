import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import { StrikeConfig } from '../models/Strike.js';
import Config from '../models/Config.js';
import { errorEmbed } from '../utils/embedBuilder.js';
import { isAdmin } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('g_strikesystemsetup')
  .setDescription('Configure the strike system for your server');

export async function execute(interaction) {
  if (!await isAdmin(interaction.member)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. Only administrators can set up the strike system.')],
      ephemeral: true,
    });
  }

  const config = await Config.findOne({ guildId: interaction.guildId });

  if (!config || !config.logChannelId) {
    return interaction.reply({
      embeds: [errorEmbed('You must set a log channel first using `/setlogchannel` before setting up the strike system.')],
      ephemeral: true,
    });
  }

  const strikeConfig = await StrikeConfig.findOne({ guildId: interaction.guildId });
  
  if (!strikeConfig || !strikeConfig.enabled) {
    return interaction.reply({
      embeds: [errorEmbed('The strike system must be enabled before you can set it up. Use `/enablestrikesystem true` to enable it first.')],
      ephemeral: true,
    });
  }

  const steps = [
    { id: 'strike_set_roles', label: 'Set Strike Level Roles (Optional)' },
    { id: 'strike_set_actions', label: 'Set Strike Actions (Kick/Timeout/Ban)' },
    { id: 'strike_setup_done', label: '✅ Done - Close Setup' },
  ];

  const menu = new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('strike_setup_menu')
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
    content: '**Strike System Setup**\n\nSelect an option below to configure your strike system:',
    components: [menu],
    ephemeral: true,
  });
}
