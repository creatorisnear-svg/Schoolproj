import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import { errorEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('18reactionrolemessage')
  .setDescription('Create a reaction role message (Staff only)');

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. This is a staff-only command.')],
      ephemeral: true,
    });
  }

  const menu = new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('reactionrole_main_menu')
        .setPlaceholder('Pick an option...')
        .addOptions(
          { label: 'Send a New Message', value: 'send_message' },
          { label: 'Add Emoji to Existing Message', value: 'add_emoji' }
        )
    );

  await interaction.reply({
    content: '**Reaction Role Setup**\n\nWhat do you want to do?',
    components: [menu],
    ephemeral: true,
  });
}
