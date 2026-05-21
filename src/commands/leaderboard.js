import { SlashCommandBuilder } from 'discord.js';
import { runLeaderboard } from '../handlers/economyActions.js';
import { getGuildLimits } from '../utils/premiumCheck.js';

export const data = new SlashCommandBuilder()
  .setName('leaderboard')
  .setDescription('View the top richest members on this server (Premium: top 25)');

export async function execute(interaction) {
  const limits = await getGuildLimits(interaction.guildId);
  return runLeaderboard(interaction, limits.leaderboardSize);
}
