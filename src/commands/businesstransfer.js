import { SlashCommandBuilder } from 'discord.js';
import { runBusinessTransfer } from '../handlers/economyActions.js';
import BusinessAccount from '../models/BusinessAccount.js';

export const data = new SlashCommandBuilder()
  .setName('businesstransfer')
  .setDescription('Transfer funds between two business accounts (requires source password)')
  .addStringOption(opt =>
    opt.setName('from')
      .setDescription('Source business account')
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addStringOption(opt =>
    opt.setName('to')
      .setDescription('Destination business account')
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addIntegerOption(opt =>
    opt.setName('amount')
      .setDescription('Amount to transfer')
      .setRequired(true)
      .setMinValue(1)
  );

export async function execute(interaction) {
  return runBusinessTransfer(interaction);
}

export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  const accounts = await BusinessAccount.find({ guildId: interaction.guildId }).lean();
  const query = focused.value.toLowerCase();
  const filtered = accounts
    .filter(a => a.name.toLowerCase().includes(query))
    .slice(0, 25)
    .map(a => ({ name: a.name, value: a.name }));
  await interaction.respond(filtered);
}
