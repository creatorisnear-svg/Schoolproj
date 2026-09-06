import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { isPremiumGuild, isGuildOnTrial, TRIAL_DAYS } from '../utils/premiumCheck.js';
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
    statusLine = '> **Active.** This server has a Premium subscription.';
  } else if (onTrial && trialExpiry) {
    statusLine = `> **Free trial.** Expires <t:${Math.floor(trialExpiry.getTime() / 1000)}:R>.`;
  } else {
    statusLine = '> **Free plan.** The features below are switched off.';
  }

  let howTo;
  if (hasPremium) {
    howTo = 'Use `/activatepremium` if you need to apply a new key.';
  } else if (onTrial) {
    // They already have all of it. The only useful thing to say is what
    // happens on the day it stops, while they can still feel what would go.
    howTo =
      '### Everything above is switched on right now\n' +
      'When the trial ends it all stops, but nothing is deleted. Your characters, tickets, shop and settings stay exactly where they are, and they come straight back if you subscribe later.\n' +
      '-# Premium is $5 a month.';
  } else {
    // No instructions to go and run something else. The button below does it.
    howTo =
      '### Try all of it free for ' + TRIAL_DAYS + ' days\n' +
      'Press the button and every feature above switches on straight away. No card, no signup, and your settings stay exactly as they are when it ends.\n' +
      '-# One trial per server, ever. Already know you want it? Pricing is below.';
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
      '`Advanced Gambling` Blackjack and Roulette *(free servers keep Slots, Dice, Cockfight, Russian Roulette)*\n\n' +
      '`Blacklist System` ban list that blocks known troublemakers at verification, before they ever get in\n\n' +
      '`No Limits` unlimited shop items, civilian jobs, requestable roles, ticket types, characters, vehicles, firearms, BOLOs, stickies and role income, plus a top 25 leaderboard\n\n' +
      howTo
    )
    .setFooter({ text: 'RPM' });

  const buttons = [];
  if (!hasPremium && !onTrial) {
    buttons.push(new ButtonBuilder()
      .setCustomId('premium_start_trial')
      .setLabel('Start the free ' + TRIAL_DAYS + ' day trial')
      .setStyle(ButtonStyle.Success));
  }
  buttons.push(new ButtonBuilder()
    .setLabel(hasPremium ? 'Manage subscription' : 'See pricing')
    .setStyle(ButtonStyle.Link)
    .setURL('https://roleplaymanager.xyz/pricing'));

  return interaction.editReply({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(...buttons)],
  });
}
