import { SlashCommandBuilder } from 'discord.js';
import { runInventory } from '../handlers/economyActions.js';

export const data = new SlashCommandBuilder()
  .setName('inventory')
  .setDescription('View your current inventory');

export async function execute(interaction) {
  return runInventory(interaction);
}
