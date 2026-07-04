import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';

export const data = new SlashCommandBuilder()
  .setName('cancelapplication')
  .setDescription('Cancel your in-progress application');

export async function execute(interaction) {
  const { hasActiveAppySession, cancelAppySession } = await import('../handlers/appyHandler.js');

  if (!hasActiveAppySession(interaction.user.id)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have an application in progress.')],
      flags: 64,
    });
  }

  const panelName = await cancelAppySession(interaction.user.id);

  return interaction.reply({
    embeds: [successEmbed('Application Cancelled', `Your application for **${panelName || 'this position'}** has been cancelled. You can restart it at any time.`)],
    flags: 64,
  });
}
