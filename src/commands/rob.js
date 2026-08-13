import { SlashCommandBuilder } from 'discord.js';
import { runRob } from '../handlers/economyActions.js';

export const data = new SlashCommandBuilder()
  .setName('rob')
  .setDescription('Attempt to rob another member\'s cash')
  .addUserOption(opt =>
    opt.setName('user')
      .setDescription('The member to rob')
      .setRequired(true)
  );

export async function execute(interaction) {
  const targetUser = interaction.options.getUser('user');
  return runRob(interaction, targetUser);
}
