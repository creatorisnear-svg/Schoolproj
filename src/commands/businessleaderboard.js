import { SlashCommandBuilder } from 'discord.js';
import { runBusinessLeaderboard } from '../handlers/economyActions.js';

export const data = new SlashCommandBuilder()
  .setName('businessleaderboard')
  .setDescription('View the top business accounts by balance');

export async function execute(interaction) {
  return runBusinessLeaderboard(interaction);
}
