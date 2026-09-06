import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import {
  activateTrialForGuild,
  isPremiumGuild,
  isGuildOnTrial,
  clearPremiumCache,
  TRIAL_DAYS,
} from '../utils/premiumCheck.js';

export const data = new SlashCommandBuilder()
  .setName('activatetrial')
  .setDescription(`Start this server's free ${TRIAL_DAYS}-day Premium trial`)
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

const embed = (title, description) => new EmbedBuilder()
  .setColor(0x2d2d2d)
  .setTitle(title)
  .setDescription(description)
  .setFooter({ text: 'RPM' });

export async function execute(interaction) {
  try {
    await interaction.deferReply({ flags: 64 });
  } catch {
    return;
  }

  const guildId = interaction.guildId;

  if (await isPremiumGuild(guildId)) {
    return interaction.editReply({
      embeds: [embed('Already Premium', 'This server already has an active Premium subscription.')],
    });
  }

  if (await isGuildOnTrial(guildId)) {
    return interaction.editReply({
      embeds: [embed('Trial Already Active', 'This server already has a free trial running.')],
    });
  }

  // No vote credit is required any more. Asking someone to leave Discord, find
  // the bot on a listing site, vote and come back before they could hear AI
  // dispatch work was the largest barrier between a server and the paid features.
  const result = await activateTrialForGuild(guildId, interaction.user.id);

  if (!result.success) {
    return interaction.editReply({
      embeds: [embed(
        'Trial Already Used',
        'This server has already used its one free trial.\n\n' +
        'To unlock Premium permanently:\n' +
        '[roleplaymanager.xyz/pricing](https://roleplaymanager.xyz/pricing)'
      )],
    });
  }

  clearPremiumCache(guildId);
  const expires = `<t:${Math.floor(result.expiresAt.getTime() / 1000)}:F>`;

  return interaction.editReply({
    embeds: [embed(
      `${TRIAL_DAYS}-Day Trial Active`,
      `Every Premium feature is unlocked on this server until ${expires}.\n\n` +
      '### What you just unlocked\n' +
      '- **AI Voice Dispatch** — the bot joins patrol channels, transcribes your officers and replies as a dispatcher\n' +
      '- **Priority Tracker** — a live priority board with cooldowns and staff controls\n' +
      '- **Applications** — custom application panels with a DM question flow\n' +
      '- Every free-tier limit removed\n\n' +
      'Run `/setup` to turn them on.\n\n' +
      '-# One free trial per server. [See pricing](https://roleplaymanager.xyz/pricing)'
    )],
  });
}
