import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { isPremiumGuild } from '../utils/premiumCheck.js';

export const data = new SlashCommandBuilder()
  .setName('premium')
  .setDescription('View premium features and how to activate premium for this server');

export async function execute(interaction) {
  await interaction.deferReply({ flags: 64 });

  const guildId = interaction.guildId;
  const hasPremium = await isPremiumGuild(guildId);

  const statusLine = hasPremium
    ? '**Status:** Premium is **active** on this server.'
    : '**Status:** This server is on the **free plan**.';

  const embed = new EmbedBuilder()
    .setColor(hasPremium ? 0x43b581 : 0x5865f2)
    .setTitle('RolePlayManager Premium')
    .setDescription(
      statusLine + '\n\n' +
      '### What Premium unlocks\n' +
      '**AI Voice Dispatch**\n' +
      '-# The bot joins your patrol voice channels, transcribes officer speech, generates a realistic AI dispatcher response, runs plate and name checks by voice, and auto-moves officers to traffic stop channels on 10-11.\n\n' +
      '**Advanced Gambling**\n' +
      '-# Blackjack and Roulette are premium-only. Free servers have access to Slots, Dice, Cockfight, and Russian Roulette.\n\n' +
      '**Unlimited Limits**\n' +
      '-# Free: 100 characters · 200 vehicles · 100 firearms · 20 BOLOs · 5 stickies · 5 ticket types · 2 role income entries · top-10 leaderboard\n' +
      '-# Premium: all of the above are **unlimited** + top-25 leaderboard\n\n' +
      '### How to activate\n' +
      'Get a premium key from our support server, then run `/activatepremium` with your key.\n\n' +
      '**[Get Premium → discord.gg/cSdhfGPeV2](https://discord.gg/cSdhfGPeV2)**'
    )
    .setFooter({ text: 'RPM' })
    .setTimestamp();

  if (!hasPremium) {
    embed.addFields({
      name: 'Already have a key?',
      value: 'Use `/activatepremium key:<your-key>` to activate it on this server.',
    });
  }

  return interaction.editReply({ embeds: [embed] });
}
