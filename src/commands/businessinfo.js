import { SlashCommandBuilder } from 'discord.js';
import { runBusinessInfo } from '../handlers/economyActions.js';
import BusinessAccount from '../models/BusinessAccount.js';

export const data = new SlashCommandBuilder()
  .setName('businessinfo')
  .setDescription('View public information about a business account')
  .addStringOption(opt =>
    opt.setName('name')
      .setDescription('Business account name')
      .setRequired(true)
      .setAutocomplete(true)
  );

export async function execute(interaction) {
  return runBusinessInfo(interaction);
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
