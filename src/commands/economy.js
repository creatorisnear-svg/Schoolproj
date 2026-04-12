import { SlashCommandBuilder } from 'discord.js';
import { getEconomyMenu } from '../handlers/economyHandler.js';

export const data = new SlashCommandBuilder()
  .setName('economy')
  .setDescription('Access the economy system');

export async function execute(interaction) {
  return interaction.reply(getEconomyMenu());
}
