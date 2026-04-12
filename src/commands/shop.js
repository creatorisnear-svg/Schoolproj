import { SlashCommandBuilder } from 'discord.js';
import { runShop } from '../handlers/economyActions.js';

export const data = new SlashCommandBuilder()
  .setName('shop')
  .setDescription('Browse the server store and GTA vehicle catalog')
  .addStringOption(opt =>
    opt.setName('search')
      .setDescription('Filter items by name or category (e.g. "Zentorno", "Helicopter", "Sports")')
      .setRequired(false)
  );

export async function execute(interaction) {
  const query = interaction.options.getString('search') || null;
  return runShop(interaction, query);
}
