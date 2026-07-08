import { SlashCommandBuilder } from 'discord.js';
import { runBusinessAdjust } from '../handlers/economyActions.js';
import BusinessAccount from '../models/BusinessAccount.js';

export const data = new SlashCommandBuilder()
  .setName('businessadjust')
  .setDescription('Staff: adjust a business account balance')
  .addStringOption(opt =>
    opt.setName('business')
      .setDescription('Business account name')
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addStringOption(opt =>
    opt.setName('action')
      .setDescription('What to do with the balance')
      .setRequired(true)
      .addChoices(
        { name: 'Add', value: 'add' },
        { name: 'Remove', value: 'remove' },
        { name: 'Set', value: 'set' },
      )
  )
  .addIntegerOption(opt =>
    opt.setName('amount')
      .setDescription('Amount')
      .setRequired(true)
      .setMinValue(0)
  );

export async function execute(interaction) {
  return runBusinessAdjust(interaction);
}

export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused().toLowerCase();
  const accounts = await BusinessAccount.find({ guildId: interaction.guildId }).lean();
  const filtered = accounts
    .filter(a => a.name.toLowerCase().includes(focused))
    .slice(0, 25)
    .map(a => ({ name: a.name, value: a.name }));
  await interaction.respond(filtered);
}
