import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { StrikeUser, StrikeConfig } from '../models/Strike.js';
import Config from '../models/Config.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('removestrike')
  .setDescription('Remove strikes from a member (Admin/Staff)')
  .addUserOption(option =>
    option
      .setName('user')
      .setDescription('The user to remove strikes from')
      .setRequired(true)
  )
  .addNumberOption(option =>
    option
      .setName('amount')
      .setDescription('Number of strikes to remove (1-4)')
      .setMinValue(1)
      .setMaxValue(4)
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('reason')
      .setDescription('Reason for removing strikes')
      .setRequired(true)
  );

export async function execute(interaction) {
  const targetUser = interaction.options.getUser('user');
  const removeAmount = interaction.options.getNumber('amount');
  const reason = interaction.options.getString('reason');

  try {
    if (!await checkStaffPermission(interaction)) {
      return interaction.reply({
        embeds: [errorEmbed('You do not have permission to use this command.')],
        flags: 64,
      });
    }
    const strikeConfig = await StrikeConfig.findOne({ guildId: interaction.guildId });

    if (!strikeConfig || !strikeConfig.enabled) {
      return interaction.reply({
        embeds: [errorEmbed('The strike system is not enabled. Please contact an administrator.')],
        flags: 64,
      });
    }

    let strikeUser = await StrikeUser.findOne({ guildId: interaction.guildId, userId: targetUser.id });

    if (!strikeUser || strikeUser.currentStrikeLevel === 0) {
      return interaction.reply({
        embeds: [errorEmbed(`${targetUser.username} has no strikes to remove.`)],
        flags: 64,
      });
    }

    const previousLevel = strikeUser.currentStrikeLevel;
    strikeUser.currentStrikeLevel = Math.max(strikeUser.currentStrikeLevel - removeAmount, 0);
    const newLevel = strikeUser.currentStrikeLevel;

    await strikeUser.save();

    // Send DM to member
    const removeDM = new EmbedBuilder()
      .setColor('#43b581')
      .setTitle('Strikes Removed')
      .setDescription(
        `**Removed by:** ${interaction.user.username}\n` +
        `**Reason:** ${reason}\n` +
        `**Removed:** ${removeAmount}\n` +
        `**Previous:** ${previousLevel}/4\n` +
        `**Current:** ${newLevel}/4`
      )
      .setTimestamp()
      .setFooter({ text: 'RPM' });

    await targetUser.send({ embeds: [removeDM] }).catch(() => {});

    // Log to log channel
    const config = await Config.findOne({ guildId: interaction.guildId });
    if (config && config.logChannelId) {
      const logChannel = await interaction.guild.channels.fetch(config.logChannelId).catch(() => null);
      if (logChannel && logChannel.isTextBased()) {
        const logEmbed = new EmbedBuilder()
          .setColor('#43b581')
          .setTitle('Strikes Removed')
          .setDescription(
            `**User:** ${targetUser.username} (${targetUser})\n` +
            `**Removed by:** ${interaction.user.username}\n` +
            `**Reason:** ${reason}\n` +
            `**Removed:** ${removeAmount}\n` +
            `**Level:** ${previousLevel}/4 → ${newLevel}/4`
          )
          .setTimestamp()
          .setFooter({ text: 'RPM' });

        await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
      }
    }

    return interaction.reply({
      embeds: [successEmbed(`Strikes Removed - ${targetUser.username}`, `Now at level **${newLevel}/4** (removed ${removeAmount})`)],
      flags: 64,
    });
  } catch (error) {
    console.error('Error removing strikes:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while removing strikes.')],
      flags: 64,
    });
  }
}
