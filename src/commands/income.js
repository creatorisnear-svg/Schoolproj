import { SlashCommandBuilder } from 'discord.js';
import { runIncome } from '../handlers/economyActions.js';

export const data = new SlashCommandBuilder()
  .setName('income')
  .setDescription('Collect your role-based income');

export async function execute(interaction) {
  return runIncome(interaction);
}
