import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import PremiumKey from '../models/PremiumKey.js';
import { attachKeyToGuild, attachFailureMessage } from '../utils/premiumKeys.js';
import { createEmbed, errorEmbed } from '../utils/embedBuilder.js';

export const data = new SlashCommandBuilder()
  .setName('activatepremium')
  .setDescription('Activate a premium key for this server')
  .addStringOption(option =>
    option
      .setName('key')
      .setDescription('Your premium activation key')
      .setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  await interaction.deferReply({ flags: 64 });

  const keyInput = interaction.options.getString('key').trim();
  const guildId = interaction.guildId;

  const keyRecord = await PremiumKey.findOne({ key: keyInput });
  if (!keyRecord) {
    return interaction.editReply({
      embeds: [errorEmbed(attachFailureMessage('invalid'))],
    });
  }

  // The same rules the dashboard and the checkout use, in one place.
  const result = await attachKeyToGuild({
    keyDoc: keyRecord,
    guildId,
    guildName: interaction.guild.name,
    userId: interaction.user.id,
    via: 'command',
  });
  if (!result.ok) {
    return interaction.editReply({ embeds: [errorEmbed(attachFailureMessage(result.reason))] });
  }

  return interaction.editReply({
    embeds: [
      createEmbed({
        title: 'Premium Activated',
        description:
          'This server now has **Premium** access.\n\n' +
          '**Unlocked:**\n' +
          '> AI Voice Dispatch (`/dispatchconfig`)\n' +
          '> Blackjack & Roulette (`/gamble`)\n' +
          '> Unlimited CAD characters, vehicles, firearms & BOLOs\n' +
          '> Unlimited sticky messages\n' +
          '> Unlimited ticket types\n' +
          '> Unlimited role income entries\n' +
          '> Extended leaderboard (top 25)\n\n' +
          '-# Use `/premium` to view your premium status at any time.',
        timestamp: true,
      }),
    ],
  });
}
