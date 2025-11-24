import { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import RoleplayCommands from '../models/RoleplayCommands.js';
import { errorEmbed } from '../utils/embedBuilder.js';

export const data = new SlashCommandBuilder()
  .setName('twitter')
  .setDescription('Post a public OOC message');

export async function execute(interaction) {
  try {
    const roleplayConfig = await RoleplayCommands.findOne({ guildId: interaction.guildId });

    if (!roleplayConfig || !roleplayConfig.enabled || !roleplayConfig.useTwitter) {
      return interaction.reply({
        embeds: [errorEmbed('The Twitter system is not enabled.')],
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
    console.error('Error in twitter command:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}
