import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('invite')
  .setDescription('Get the invite link for EverLink');

export async function execute(interaction) {
  const embed = new EmbedBuilder()
    .setColor('#2E2E2E')
    .setTitle('🤖 Invite EverLink')
    .setDescription('[Click here to invite EverLink to your server](https://top.gg/bot/1441306995641683978)')
    .setFooter({ text: 'EverLink' });

  return interaction.reply({
    embeds: [embed],
    ephemeral: true
  });
}
