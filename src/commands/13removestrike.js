import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { StrikeUser, StrikeConfig } from '../models/Strike.js';
import Config from '../models/Config.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('removestrike')
  .setDescription('Remove strikes from a member (Staff only)')
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
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. This is a staff-only command.')],
      ephemeral: true,
    });
  }

  const targetUser = interaction.options.getUser('user');
  const removeAmount = interaction.options.getNumber('amount');
  const reason = interaction.options.getString('reason');

  try {
    const strikeConfig = await StrikeConfig.findOne({ guildId: interaction.guildId });

    if (!strikeConfig || !strikeConfig.enabled) {
      return interaction.reply({
        embeds: [errorEmbed('The strike system is not enabled. Please contact an administrator.')],
        ephemeral: true,
      });
    }

    let strikeUser = await StrikeUser.findOne({ guildId: interaction.guildId, userId: targetUser.id });

    if (!strikeUser || strikeUser.currentStrikeLevel === 0) {
      return interaction.reply({
        embeds: [errorEmbed(`${targetUser.username} has no strikes to remove.`)],
        ephemeral: true,
      });
    }

    const previousLevel = strikeUser.currentStrikeLevel;
    strikeUser.currentStrikeLevel = Math.max(strikeUser.currentStrikeLevel - removeAmount, 0);
    const newLevel = strikeUser.currentStrikeLevel;

    await strikeUser.save();

    // Send DM to member
    const removeDM = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('✅ Strikes Removed')
      .addFields(
        { name: '13removestrike.jsremovestrike', value: interaction.user.username, inline: false },
        { name: '13removestrike.jsremovestrike', value: reason, inline: false },
        { name: '13removestrike.jsremovestrike', value: `${removeAmount}`, inline: false },
        { name: '13removestrike.jsremovestrike', value: `${previousLevel}/4`, inline: false },
        { name: '13removestrike.jsremovestrike', value: `${newLevel}/4`, inline: false }
      )
      .setTimestamp()
      .setFooter({ text: 'EverLink' });

    await targetUser.send({ embeds: [removeDM] }).catch(() => {});

    // Log to log channel
    const config = await Config.findOne({ guildId: interaction.guildId });
    if (config && config.logChannelId) {
      const logChannel = await interaction.guild.channels.fetch(config.logChannelId).catch(() => null);
      if (logChannel && logChannel.isTextBased()) {
        const logEmbed = new EmbedBuilder()
          .setColor('#00ff00')
          .setTitle('✅ Strikes Removed')
          .addFields(
            { name: '13removestrike.jsremovestrike', value: `${targetUser.username} (${targetUser})`, inline: false },
            { name: '13removestrike.jsremovestrike', value: `${interaction.user.username}`, inline: false },
            { name: '13removestrike.jsremovestrike', value: reason, inline: false },
            { name: '13removestrike.jsremovestrike', value: `${previousLevel}/4`, inline: false },
            { name: '13removestrike.jsremovestrike', value: `${newLevel}/4`, inline: false },
            { name: '13removestrike.jsremovestrike', value: `${removeAmount}`, inline: false }
          )
          .setTimestamp()
          .setFooter({ text: 'EverLink' });

        await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
      }
    }

    return interaction.reply({
      embeds: [successEmbed(`${targetUser.username} Strikes Removed`, `${targetUser.username} is now at strike level ${newLevel}/4\n\nStrikes removed: ${removeAmount}`)],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error removing strikes:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while removing strikes.')],
      ephemeral: true,
    });
  }
}
