import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import PremiumKey from '../models/PremiumKey.js';
import TopggVote from '../models/TopggVote.js';
import { clearPremiumCache, isPremiumGuild } from '../utils/premiumCheck.js';

const BOT_ID = '1441306995641683978';
const VOTE_URL = `https://top.gg/bot/${BOT_ID}/vote`;
const TRIAL_DURATION_MS = 24 * 60 * 60 * 1000;

export const data = new SlashCommandBuilder()
  .setName('freetrial')
  .setDescription('Get a free 24-hour trial of AI Dispatch by voting for us on top.gg')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const guildId = interaction.guildId;
  const userId = interaction.user.id;

  const alreadyPremium = await isPremiumGuild(guildId);
  if (alreadyPremium) {
    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor('#f59e0b')
        .setTitle('Already Active')
        .setDescription('This server already has an active premium or trial subscription.')
        .setFooter({ text: 'RPM • Free Trial' })],
    });
  }

  const existingTrial = await PremiumKey.findOne({ guildId, isTrialKey: true });
  if (existingTrial) {
    const timeLeft = existingTrial.expiresAt - new Date();
    if (timeLeft > 0) {
      const hoursLeft = Math.ceil(timeLeft / (1000 * 60 * 60));
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor('#f59e0b')
          .setTitle('Trial Already Active')
          .setDescription(`This server already has a free trial running.\n\n**Time remaining:** ${hoursLeft} hour(s)`)
          .setFooter({ text: 'RPM • Free Trial' })],
      });
    }
  }

  const vote = await TopggVote.findOne({ userId, used: false }).sort({ votedAt: -1 });

  if (!vote) {
    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor('#5865f2')
        .setTitle('Vote to Get a Free Trial')
        .setDescription(
          'Vote for **RolePlayManager** on top.gg to unlock a **free 24-hour trial** of AI Dispatch for this server.\n\n' +
          `**[Click here to vote](${VOTE_URL})**\n\n` +
          'After voting, come back and run **/freetrial** again to activate your trial.\n\n' +
          '> One trial per server. Voting again after the trial expires lets you get another one.'
        )
        .setFooter({ text: 'RPM • Free Trial' })
        .setTimestamp()],
    });
  }

  const trialKey = `TRIAL-${guildId}-${Date.now()}`;
  const expiresAt = new Date(Date.now() + TRIAL_DURATION_MS);

  await PremiumKey.create({
    key: trialKey,
    guildId,
    guildName: interaction.guild.name,
    activatedBy: userId,
    activatedAt: new Date(),
    expiresAt,
    isTrialKey: true,
  });

  vote.used = true;
  await vote.save();

  clearPremiumCache(guildId);

  return interaction.editReply({
    embeds: [new EmbedBuilder()
      .setColor('#4ade80')
      .setTitle('Free Trial Activated!')
      .setDescription(
        'Your **24-hour free trial** of AI Dispatch is now active for this server!\n\n' +
        '**Unlocked for 24 hours:**\n' +
        '> AI Voice Dispatch\n' +
        '> Unlimited Characters\n' +
        '> Unlimited Vehicles\n' +
        '> Unlimited Firearms\n' +
        '> Unlimited BOLOs\n\n' +
        `**Expires:** <t:${Math.floor(expiresAt.getTime() / 1000)}:F>\n\n` +
        'To keep it after the trial, grab a premium key from our support server.'
      )
      .setFooter({ text: 'RPM • Free Trial' })
      .setTimestamp()],
  });
}
