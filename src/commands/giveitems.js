import { SlashCommandBuilder } from 'discord.js';
import { runGiveItem } from '../handlers/economyActions.js';

export const data = new SlashCommandBuilder()
  .setName('giveitems')
  .setDescription('Give an item from your inventory to another member')
  .addUserOption(opt =>
    opt.setName('user')
      .setDescription('The member to give the item to')
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('item')
      .setDescription('Name of the item to give')
      .setRequired(true)
  )
  .addIntegerOption(opt =>
    opt.setName('quantity')
      .setDescription('How many to give (default: 1)')
      .setRequired(false)
      .setMinValue(1)
  );

export async function execute(interaction) {
  const targetUser = interaction.options.getUser('user');
  const itemName = interaction.options.getString('item');
  const quantity = interaction.options.getInteger('quantity') ?? 1;
  return runGiveItem(interaction, targetUser, itemName, quantity);
}
