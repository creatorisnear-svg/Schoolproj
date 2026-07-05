import { SlashCommandBuilder } from 'discord.js';
import { runBusiness } from '../handlers/economyActions.js';

export const data = new SlashCommandBuilder()
  .setName('business')
  .setDescription('Access a business account');

export async function execute(interaction) {
  return runBusiness(interaction);
}
