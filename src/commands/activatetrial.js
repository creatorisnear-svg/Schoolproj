import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { activateTrialForGuild, TOPGG_VOTE_URL } from '../utils/premiumCheck.js';
import { isPremiumGuild, isGuildOnTrial } from '../utils/premiumCheck.js';

export const data = new SlashCommandBuilder()
  .setName('activatetrial')
  .setDescription('Activate your 3-day free trial using your Top.gg vote credit')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const guildId = interaction.guildId;
  const userId = interaction.user.id;

  const alreadyPremium = await isPremiumGuild(guildId);
  if (alreadyPremium) {
    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0x2d2d2d)
        .setTitle('Already Premium')
        .setDescription('This server already has an active Premium subscription.')
        .setFooter({ text: 'RPM' })],
    });
  }

  const alreadyOnTrial = await isGuildOnTrial(guildId);
  if (alreadyOnTrial) {
    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0x2d2d2d)
        .setTitle('Trial Already Active')
        .setDescription('This server already has an active free trial running.')
        .setFooter({ text: 'RPM' })],
    });
  }

  const result = await activateTrialForGuild(guildId, userId);

  if (!result.success) {
    if (result.reason === 'used') {
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0x2d2d2d)
          .setTitle('Trial Already Used')
          .setDescription(
            'This server has already claimed its one-time free trial.\n\n' +
            'To unlock Premium permanently:\n' +
            '[roleplaymanager.xyz/pricing](https://roleplaymanager.xyz/pricing)'
          )
          .setFooter({ text: 'RPM' })],
      });
    }
    if (result.reason === 'no_vote') {
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0x2d2d2d)
          .setTitle('No Vote Credit Found')
          .setDescription(
            `You need to vote for the bot on Top.gg first, then run this command again.\n\n` +
            `[Vote on Top.gg](${TOPGG_VOTE_URL})\n\n` +
            `-# Your vote credit is valid for 7 days after voting. Each server can only claim one trial, ever.`
          )
          .setFooter({ text: 'RPM' })],
      });
    }
  }

  const expires = `<t:${Math.floor(result.expiresAt.getTime() / 1000)}:F>`;
  return interaction.editReply({
    embeds: [new EmbedBuilder()
      .setColor(0x2d2d2d)
      .setTitle('3-Day Trial Activated')
      .setDescription(
        `Your free trial is now active on this server.\n\n` +
        `**Expires:** ${expires}\n\n` +
        `All premium features are unlocked until then. ` +
        `If you enjoy it, consider supporting the bot:\n` +
        `[roleplaymanager.xyz/pricing](https://roleplaymanager.xyz/pricing)\n\n` +
        `-# This server cannot claim another free trial after this one expires.`
      )
      .setFooter({ text: 'RPM' })],
  });
}
