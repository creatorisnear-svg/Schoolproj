import { SlashCommandBuilder } from 'discord.js';
import { runGive } from '../handlers/economyActions.js';

export const data = new SlashCommandBuilder()
  .setName('give')
  .setDescription('Send cash to another member')
  .addUserOption(opt =>
    opt.setName('user')
      .setDescription('The member to send money to')
      .setRequired(true)
  )
  .addIntegerOption(opt =>
    opt.setName('amount')
      .setDescription('Amount of cash to send')
      .setRequired(true)
      .setMinValue(1)
  );

export async function execute(interaction) {
  const targetUser = interaction.options.getUser('user');
  const amount = interaction.options.getInteger('amount');
  return runGive(interaction, targetUser, amount);
}
