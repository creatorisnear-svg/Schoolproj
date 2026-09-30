import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { isPremiumGuild, isGuildOnTrial, trialUsed, pricingUrl, chipInUrl, hasPaidPlan, TRIAL_DAYS } from '../utils/premiumCheck.js';
import { fundStatus, dollars, progressBar, FUND_GOAL_CENTS } from '../utils/premiumFund.js';
import GuildTrial from '../models/GuildTrial.js';

export const data = new SlashCommandBuilder()
  .setName('premium')
  .setDescription('View premium status, features, and how to upgrade this server');

export async function execute(interaction) {
  try { await interaction.deferReply({ flags: 64 }); } catch { return; }

  const guildId = interaction.guildId;
  const [hasPremium, onTrial, paidPlan, fund] = await Promise.all([
    isPremiumGuild(guildId),
    isGuildOnTrial(guildId),
    hasPaidPlan(guildId).catch(() => false),
    fundStatus(guildId).catch(() => null),
  ]);
  // Premium that only the members' chip-ins pay for: it runs out, and they can add to it.
  const fromFund = hasPremium && !paidPlan && !!fund?.until;
  // Once the trial is spent, offering it again only leads to a dead end.
  const usedTrial = !hasPremium && !onTrial && await trialUsed(guildId).catch(() => false);

  let trialExpiry = null;
  if (onTrial) {
    const trial = await GuildTrial.findOne({ guildId, active: true });
    if (trial) trialExpiry = trial.expiresAt;
  }

  let statusLine;
  if (fromFund) {
    statusLine = `> **Active until <t:${Math.floor(fund.until.getTime() / 1000)}:D>.** Paid for by members of this server.`;
  } else if (hasPremium) {
    statusLine = '> **Active.** This server has a Premium subscription.';
  } else if (onTrial && trialExpiry) {
    statusLine = `> **Free trial.** Expires <t:${Math.floor(trialExpiry.getTime() / 1000)}:R>.`;
  } else {
    statusLine = '> **Free plan.** The features below are switched off.';
  }

  let howTo;
  if (fromFund) {
    howTo = 'Every $5 your members chip in adds another month.';
  } else if (hasPremium) {
    howTo = 'Use `/activatepremium` if you need to apply a new key.';
  } else if (onTrial) {
    // They already have all of it. The only useful thing to say is what
    // happens on the day it stops, while they can still feel what would go.
    howTo =
      '### Everything above is switched on right now\n' +
      'When the trial ends it all stops, but nothing is deleted. Your characters, tickets, shop and settings stay exactly where they are, and they come straight back if you subscribe later.\n' +
      '-# Premium is $5 a month.';
  } else if (usedTrial) {
    howTo =
      '### This server has had its free trial\n' +
      'Premium switches on for this server the moment the payment goes through. Everything you set up during the trial is still saved.\n' +
      '-# Premium is $5 a month, or less on a longer plan.';
  } else {
    // No instructions to go and run something else. The button below does it.
    howTo =
      '### Try all of it free for ' + TRIAL_DAYS + ' days\n' +
      'Press the button and every feature above switches on straight away. No card, no signup, and your settings stay exactly as they are when it ends.\n' +
      '-# One trial per server, ever. Already know you want it? Pricing is below.';
  }

  // Anyone in the server can put money toward it, unless the server pays itself.
  if (!paidPlan && fund) {
    howTo +=
      '\n\n### Members can chip in\n' +
      '`' + progressBar(fund.balanceCents) + '`  **' + dollars(fund.balanceCents) + ' of ' + dollars(FUND_GOAL_CENTS) + '** raised\n' +
      'Anyone in this server can put $2 or more toward Premium. Every $5 turns it on for a month.';
  }

  const embed = new EmbedBuilder()
    .setColor(hasPremium ? 0x43b581 : onTrial ? 0x5865f2 : 0x2d2d2d)
    .setTitle('RolePlayManager Premium')
    .setDescription(
      statusLine + '\n\n' +
      '### What Premium Unlocks\n' +
      '`AI Voice Dispatch` bot joins patrol voice channels, transcribes speech, generates AI dispatcher responses, runs plate/name checks by voice, auto-moves officers on 10-11\n\n' +
       '`Priority Tracker` live priority status board, cooldown tracking, and staff controls for active events\n\n' +
       '`Applications` custom application panels with DM questions, review buttons, and optional role assignment\n\n' +
       '`Evidence Locker` log seized items against people, arrest reports and cases in the web CAD\n\n' +
      '`Advanced Gambling` Blackjack and Roulette *(free servers keep Slots, Dice, Cockfight, Russian Roulette)*\n\n' +
      '`Blacklist System` ban list that blocks known troublemakers at verification, before they ever get in\n\n' +
      '`Safety Network auto-bans` ban anyone who joins after being banned in several other network servers\n\n' +
      '`No Limits` unlimited shop items, civilian jobs, requestable roles, ticket types, characters, vehicles, firearms, BOLOs, stickies and role income, plus a top 25 leaderboard\n\n' +
      howTo
    )
    .setFooter({ text: 'RPM' });

  const buttons = [];
  if (!hasPremium && !onTrial && !usedTrial) {
    buttons.push(new ButtonBuilder()
      .setCustomId('premium_start_trial')
      .setLabel('Start the free ' + TRIAL_DAYS + ' day trial')
      .setStyle(ButtonStyle.Success));
  }
  buttons.push(new ButtonBuilder()
    .setLabel(paidPlan ? 'Manage subscription' : usedTrial ? 'Get Premium for this server' : 'See pricing')
    .setStyle(ButtonStyle.Link)
    .setURL(pricingUrl('premium', guildId)));
  if (!paidPlan) {
    buttons.push(new ButtonBuilder()
      .setLabel('Chip in')
      .setStyle(ButtonStyle.Link)
      .setURL(chipInUrl('premium', guildId)));
  }

  return interaction.editReply({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(...buttons)],
  });
}
