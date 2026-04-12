import { SlashCommandBuilder } from 'discord.js';
import { runSell } from '../handlers/economyActions.js';

export const data = new SlashCommandBuilder()
  .setName('sell')
  .setDescription('Sell an item from your inventory for 50% of its value')
  .addStringOption(opt =>
    opt.setName('item')
      .setDescription('Name of the item to sell')
      .setRequired(true)
  )
  .addIntegerOption(opt =>
    opt.setName('quantity')
      .setDescription('How many to sell (default: 1)')
      .setRequired(false)
      .setMinValue(1)
  );

export async function execute(interaction) {
  const itemName = interaction.options.getString('item');
  const quantity = interaction.options.getInteger('quantity') ?? 1;
  return runSell(interaction, itemName, quantity);
}
