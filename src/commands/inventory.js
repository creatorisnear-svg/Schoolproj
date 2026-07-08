import { SlashCommandBuilder } from 'discord.js';
import { runInventory } from '../handlers/economyActions.js';

export const data = new SlashCommandBuilder()
  .setName('inventory')
  .setDescription('View your current inventory')
  .addUserOption(o => o
    .setName('user')
    .setDescription("View another member's inventory")
    .setRequired(false));

export async function execute(interaction) {
  return runInventory(interaction);
}
