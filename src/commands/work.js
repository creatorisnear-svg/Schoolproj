import { SlashCommandBuilder } from 'discord.js';
import { runWork } from '../handlers/economyActions.js';

export const data = new SlashCommandBuilder()
  .setName('work')
  .setDescription('Work a job to earn money');

export async function execute(interaction) {
  return runWork(interaction);
}
