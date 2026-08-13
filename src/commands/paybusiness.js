import { SlashCommandBuilder } from 'discord.js';
import { runPayBusiness } from '../handlers/economyActions.js';

export const data = new SlashCommandBuilder()
  .setName('paybusiness')
  .setDescription('Send cash from your wallet to a business account')
  .addStringOption(opt =>
    opt.setName('name')
      .setDescription('Business account name')
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addIntegerOption(opt =>
    opt.setName('amount')
      .setDescription('Amount of cash to pay')
      .setRequired(true)
      .setMinValue(1)
  );

export async function execute(interaction) {
  return runPayBusiness(interaction);
}

export async function autocomplete(interaction) {
  const { default: BusinessAccount } = await import('../models/BusinessAccount.js');
  const focused = interaction.options.getFocused().toLowerCase();
  const accounts = await BusinessAccount.find({ guildId: interaction.guildId }).lean();
  const filtered = accounts
    .filter(a => a.name.toLowerCase().includes(focused))
    .slice(0, 25)
    .map(a => ({ name: a.name, value: a.name }));
  await interaction.respond(filtered);
}
