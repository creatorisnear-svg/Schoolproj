import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import { errorEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('reactionrolemessage')
  .setDescription('Create a message with emoji reactions for role assignment (Staff only)')
  .addStringOption(option =>
    option
      .setName('message')
      .setDescription('The message content to send (up to 2000 characters)')
      .setRequired(true)
  );

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. This is a staff-only command.')],
      ephemeral: true,
    });
  }

  const messageContent = interaction.options.getString('message');

  const menu = new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('reactionrole_setup')
        .setPlaceholder('Select action...')
        .addOptions(
          { label: 'Send Reaction Role Message', value: 'send_message', description: 'Send the reaction role message' },
          { label: 'Configure Emoji-Role Pairs', value: 'config_emojis', description: 'Set up emoji-role pairs' }
        )
    );

  await interaction.reply({
    content: `**Message to Send:**\n\`\`\`\n${messageContent}\n\`\`\`\n\nSelect an action below:`,
    components: [menu],
    ephemeral: true,
  });
}
