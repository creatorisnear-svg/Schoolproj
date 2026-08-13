import { SlashCommandBuilder } from 'discord.js';
import { runBalance } from '../handlers/economyActions.js';

export const data = new SlashCommandBuilder()
  .setName('balance')
  .setDescription('Check your cash and bank balance')
  .addUserOption(o => o
    .setName('user')
    .setDescription('Check another member\'s balance')
    .setRequired(false));

export async function execute(interaction) {
  return runBalance(interaction);
}
