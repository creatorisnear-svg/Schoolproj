import { SlashCommandBuilder } from 'discord.js';
import { runBuy } from '../handlers/economyActions.js';

export const data = new SlashCommandBuilder()
  .setName('buy')
  .setDescription('Purchase an item from the store')
  .addStringOption(opt =>
    opt.setName('item')
      .setDescription('Name of the item to buy (e.g. "Zentorno", "Buzzard")')
      .setRequired(true)
  )
  .addIntegerOption(opt =>
    opt.setName('quantity')
      .setDescription('How many to buy (default: 1)')
      .setRequired(false)
      .setMinValue(1)
  );

export async function execute(interaction) {
  const itemName = interaction.options.getString('item');
  const quantity = interaction.options.getInteger('quantity') ?? 1;
  return runBuy(interaction, itemName, quantity);
}
