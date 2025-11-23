import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { StrikeUser, StrikeConfig } from '../models/Strike.js';
import Config from '../models/Config.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('strike')
  .setDescription('Strike a member (Staff only)')
  .addUserOption(option =>
    option
      .setName('user')
      .setDescription('The user to strike')
      .setRequired(true)
  )
  .addNumberOption(option =>
    option
      .setName('strikes')
      .setDescription('Number of strikes (1-4)')
      .setMinValue(1)
      .setMaxValue(4)
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('reason')
      .setDescription('Reason for the strike')
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
  const strikeLevel = interaction.options.getNumber('strikes');
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
    
    if (!strikeUser) {
      strikeUser = new StrikeUser({
        guildId: interaction.guildId,
        userId: targetUser.id,
        currentStrikeLevel: strikeLevel,
      });
    } else {
      strikeUser.currentStrikeLevel = strikeLevel;
    }

    await strikeUser.save();

    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    let actionTaken = 'No action taken';

    if (targetMember) {
      const strikeKey = `strike${strikeLevel}`;
      const strikeConfig_data = strikeConfig.strikes[strikeKey];

      if (strikeConfig_data && strikeConfig_data.action && strikeConfig_data.action !== 'none') {
        const action = strikeConfig_data.action;

        if (action === 'kick') {
          await targetMember.kick(`Strike ${strikeLevel}: ${reason}`).catch(() => {});
          actionTaken = '👢 Kicked from server';
        } else if (action === 'timeout') {
          const durationMs = strikeConfig_data.duration * 60 * 1000;
          await targetMember.timeout(durationMs, `Strike ${strikeLevel}: ${reason}`).catch(() => {});
          actionTaken = `⏱️ Timed out for ${strikeConfig_data.duration} minutes`;
        } else if (action === 'ban') {
          await targetMember.ban({ reason: `Strike ${strikeLevel}: ${reason}` }).catch(() => {});
          actionTaken = '🚫 Banned from server';
        }
      }

      if (strikeConfig_data && strikeConfig_data.roleId) {
        const role = interaction.guild.roles.cache.get(strikeConfig_data.roleId);
        if (role) {
          await targetMember.roles.add(role).catch(() => {});
        }
      }

      // Send DM to struck member
      const strikeDM = new EmbedBuilder()
        .setColor('#ff6b6b')
        .setTitle('⚠️ You Have Been Striked')
        .addFields(
          { name: 'Striked By', value: interaction.user.username, inline: false },
          { name: 'Reason', value: reason, inline: false },
          { name: 'Strike Level', value: `${strikeLevel}/4`, inline: false },
          { name: 'Action Taken', value: actionTaken, inline: false }
        )
        .setTimestamp()
        .setFooter({ text: 'EverLink' });

      await targetUser.send({ embeds: [strikeDM] }).catch(() => {});
    }

    const config = await Config.findOne({ guildId: interaction.guildId });
    if (config && config.logChannelId) {
      const logChannel = await interaction.guild.channels.fetch(config.logChannelId).catch(() => null);
      if (logChannel && logChannel.isTextBased()) {
        const logEmbed = new EmbedBuilder()
          .setColor('#ff9900')
          .setTitle(`⚠️ Member Striked - Strike Level ${strikeLevel}`)
          .addFields(
            { name: 'Member', value: `${targetUser.username} (${targetUser})`, inline: false },
            { name: 'Striked By', value: `${interaction.user.username}`, inline: false },
            { name: 'Reason', value: reason, inline: false },
            { name: 'Current Strike Level', value: `${strikeLevel}/4`, inline: false },
            { name: 'Action Taken', value: actionTaken, inline: false }
          )
          .setTimestamp()
          .setFooter({ text: 'EverLink' });

        await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
      }
    }

    return interaction.reply({
      embeds: [successEmbed(`${targetUser.username} has been striked`, `Strike level: ${strikeLevel}/4\nAction: ${actionTaken}`)],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error striking member:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while striking the member.')],
      ephemeral: true,
    });
  }
}
