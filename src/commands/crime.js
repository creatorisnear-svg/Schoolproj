import { SlashCommandBuilder } from 'discord.js';
import { runCrime } from '../handlers/economyActions.js';

export const data = new SlashCommandBuilder()
  .setName('crime')
  .setDescription('Commit a crime for a chance at bigger money (risky)');

export async function execute(interaction) {
  return runCrime(interaction);
}
