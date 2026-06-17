import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { isPremiumGuild, isGuildOnTrial, TOPGG_VOTE_URL } from '../utils/premiumCheck.js';
import GuildTrial from '../models/GuildTrial.js';

export const data = new SlashCommandBuilder()
  .setName('premium')
  .setDescription('View premium status, features, and how to upgrade this server');

export async function execute(interaction) {
  try { await interaction.deferReply({ flags: 64 }); } catch { return; }

  const guildId = interaction.guildId;
  const [hasPremium, onTrial] = await Promise.all([
    isPremiumGuild(guildId),
    isGuildOnTrial(guildId),
  ]);

  let trialExpiry = null;
  if (onTrial) {
    const trial = await GuildTrial.findOne({ guildId, active: true });
    if (trial) trialExpiry = trial.expiresAt;
  }

  let statusLine;
  if (hasPremium) {
    statusLine = '> **Active** — this server has a Premium subscription.';
  } else if (onTrial && trialExpiry) {
    statusLine = `> **Free Trial** — expires <t:${Math.floor(trialExpiry.getTime() / 1000)}:R>.`;
  } else {
    statusLine = '> **Free Plan** — upgrade to unlock all premium features.';
  }

  let howTo;
  if (hasPremium) {
    howTo =
      'This server already has Premium active. Use `/activatepremium` if you need to apply a new key.\n\n' +
      '[Manage Subscription](https://roleplaymanager.xyz/pricing)';
  } else {
    howTo =
      '### Purchase Premium\n' +
      '[**roleplaymanager.xyz/pricing**](https://roleplaymanager.xyz/pricing)\n' +
      '-# Once you have a key, run `/activatepremium` in this server to activate it.\n\n' +
      '### Free 3-Day Trial\n' +
      `[Vote for us on Top.gg](${TOPGG_VOTE_URL || 'https://top.gg'}) — takes 10 seconds. ` +
      'After voting, run `/activatetrial` in this server to unlock all premium features for 3 days.\n' +
      '-# One trial per server, ever.';
  }

  const embed = new EmbedBuilder()
    .setColor(hasPremium ? 0x43b581 : onTrial ? 0x5865f2 : 0x2d2d2d)
    .setTitle('RolePlayManager Premium')
    .setDescription(
      statusLine + '\n\n' +
      '### What Premium Unlocks\n' +
      '`AI Voice Dispatch` — bot joins patrol voice channels, transcribes speech, generates AI dispatcher responses, runs plate/name checks by voice, auto-moves officers on 10-11\n\n' +
      '`Advanced Gambling` — Blackjack and Roulette *(free servers keep Slots, Dice, Cockfight, Russian Roulette)*\n\n' +
      '`Unlimited Everything` — characters, vehicles, firearms, BOLOs, stickies, ticket types, role income entries, top-25 leaderboard *(free: capped at lower limits)*\n\n' +
      howTo
    )
    .setFooter({ text: 'RPM' });

  return interaction.editReply({ embeds: [embed] });
}
