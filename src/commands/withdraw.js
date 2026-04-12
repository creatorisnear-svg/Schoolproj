import { SlashCommandBuilder } from 'discord.js';
import { runWithdraw } from '../handlers/economyActions.js';

export const data = new SlashCommandBuilder()
  .setName('withdraw')
  .setDescription('Withdraw cash from your bank account')
  .addStringOption(opt =>
    opt.setName('amount')
      .setDescription('Amount to withdraw, or "all" to withdraw everything')
      .setRequired(true)
  );

export async function execute(interaction) {
  const amount = interaction.options.getString('amount');
  return runWithdraw(interaction, amount);
}
