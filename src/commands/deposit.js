import { SlashCommandBuilder } from 'discord.js';
import { runDeposit } from '../handlers/economyActions.js';

export const data = new SlashCommandBuilder()
  .setName('deposit')
  .setDescription('Deposit cash into your bank account')
  .addStringOption(opt =>
    opt.setName('amount')
      .setDescription('Amount to deposit, or "all" to deposit everything')
      .setRequired(true)
  );

export async function execute(interaction) {
  const amount = interaction.options.getString('amount');
  return runDeposit(interaction, amount);
}
