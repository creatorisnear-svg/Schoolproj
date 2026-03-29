import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('invite')
  .setDescription('Get the invite link for RolePlayManager');

export async function execute(interaction) {
  const embed = new EmbedBuilder()
    .setColor('#2d2d2d')
    .setTitle('Invite')
    .setDescription('[Add RolePlayManager to your server](https://top.gg/bot/1441306995641683978)')
    .setFooter({ text: 'RPM' });

  return interaction.reply({
    embeds: [embed],
    ephemeral: true
  });
}
