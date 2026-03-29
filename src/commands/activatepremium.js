import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import PremiumKey from '../models/PremiumKey.js';
import { clearPremiumCache, isPremiumGuild } from '../utils/premiumCheck.js';
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
  await interaction.deferReply({ ephemeral: true });

  const keyInput = interaction.options.getString('key').trim();
  const guildId = interaction.guildId;

  const alreadyPremium = await isPremiumGuild(guildId);
  if (alreadyPremium) {
    return interaction.editReply({
      embeds: [errorEmbed('This server already has an active premium subscription.')],
    });
  }

  const keyRecord = await PremiumKey.findOne({ key: keyInput });

  if (!keyRecord) {
    return interaction.editReply({
      embeds: [errorEmbed('Invalid premium key. Please check your key and try again.')],
    });
  }

  if (keyRecord.guildId) {
    return interaction.editReply({
      embeds: [errorEmbed('This key has already been activated in another server.')],
    });
  }

  keyRecord.guildId = guildId;
  keyRecord.guildName = interaction.guild.name;
  keyRecord.activatedBy = interaction.user.id;
  keyRecord.activatedAt = new Date();
  await keyRecord.save();

  clearPremiumCache(guildId);

  return interaction.editReply({
    embeds: [
      createEmbed({
        title: 'Premium Activated',
        description:
          'This server now has **Premium** access.\n\n' +
          '**Unlocked:**\n' +
          '> AI Voice Dispatch\n' +
          '> Unlimited Characters\n' +
          '> Unlimited Vehicles\n' +
          '> Unlimited Firearms\n' +
          '> Unlimited BOLOs\n' +
          '> Unlimited Stickies',
        timestamp: true,
      }),
    ],
  });
}
