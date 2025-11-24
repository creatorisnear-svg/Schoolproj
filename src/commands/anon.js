import { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import RoleplayCommands from '../models/RoleplayCommands.js';
import { errorEmbed } from '../utils/embedBuilder.js';

export const data = new SlashCommandBuilder()
  .setName('anon')
  .setDescription('Post an anonymous/black market message');

export async function execute(interaction) {
  try {
    const roleplayConfig = await RoleplayCommands.findOne({ guildId: interaction.guildId });

    if (!roleplayConfig || !roleplayConfig.enabled || !roleplayConfig.useAnon) {
      return interaction.reply({
        embeds: [errorEmbed('The anonymous posting system is not enabled.')],
        ephemeral: true,
      });
    }

    const modal = new ModalBuilder()
      .setCustomId('anon_post_modal')
      .setTitle('Post Anonymously')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('anon_message')
            .setLabel('Message')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('What do you want to post anonymously?')
            .setMinLength(1)
            .setMaxLength(2000)
            .setRequired(true)
        )
      );

    return interaction.showModal(modal);
  } catch (error) {
    console.error('Error in anon command:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}
