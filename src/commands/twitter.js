import { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import RoleplayCommands from '../models/RoleplayCommands.js';
import { errorEmbed } from '../utils/embedBuilder.js';

export const data = new SlashCommandBuilder()
  .setName('twitter')
  .setDescription('Post a message to Twitter');

export async function execute(interaction) {
  try {
    const roleplayConfig = await RoleplayCommands.findOne({ guildId: interaction.guildId });

    if (!roleplayConfig || !roleplayConfig.useTwitter || !roleplayConfig.twitterChannel) {
      return interaction.reply({
        embeds: [errorEmbed('Twitter posting is not enabled.')],
        ephemeral: true,
      });
    }

    const modal = new ModalBuilder()
      .setCustomId('twitter_post_modal')
      .setTitle('Post to Twitter')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('twitter_message')
            .setLabel('Message')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('What do you want to post?')
            .setMinLength(1)
            .setMaxLength(2000)
            .setRequired(true)
        )
      );

    return interaction.showModal(modal);
  } catch (error) {
    console.error('Error executing twitter command:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}
