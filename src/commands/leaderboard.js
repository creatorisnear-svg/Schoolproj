import { SlashCommandBuilder } from 'discord.js';
import { runLeaderboard } from '../handlers/economyActions.js';

export const data = new SlashCommandBuilder()
  .setName('leaderboard')
  .setDescription('View the top 10 richest members on the server');

export async function execute(interaction) {
  return runLeaderboard(interaction);
}
