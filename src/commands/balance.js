import { SlashCommandBuilder } from 'discord.js';
import { runBalance } from '../handlers/economyActions.js';

export const data = new SlashCommandBuilder()
  .setName('balance')
  .setDescription('Check your cash and bank balance');

export async function execute(interaction) {
  return runBalance(interaction);
}
