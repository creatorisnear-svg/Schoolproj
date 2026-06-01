import { SlashCommandBuilder } from 'discord.js';
import { runUse } from '../handlers/economyActions.js';

export const data = new SlashCommandBuilder()
  .setName('use')
  .setDescription('Use a usable item from your inventory')
  .addStringOption(opt =>
    opt.setName('item')
      .setDescription('Name of the item to use - start typing to search your inventory')
      .setRequired(true)
      .setAutocomplete(true)
  );

export async function execute(interaction) {
  const itemName = interaction.options.getString('item');
  return runUse(interaction, itemName);
}
