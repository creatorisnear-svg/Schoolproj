import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { StrikeUser, StrikeConfig } from '../models/Strike.js';
import Config from '../models/Config.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('strike')
  .setDescription('Strike a member (Admin/Staff)')
  .addUserOption(option =>
    option
      .setName('user')
      .setDescription('The user to strike')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('reason')
      .setDescription('Reason for the strike')
      .setRequired(true)
  );

export async function execute(interaction) {
  const targetUser = interaction.options.getUser('user');
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
        embeds: [errorEmbed('The strike system is not enabled. Run `/strikesystemconfig` first.')],
        flags: 64,
      });
    }

    let strikeUser = await StrikeUser.findOne({ guildId: interaction.guildId, userId: targetUser.id });
    
    let strikeLevel = 1;
    
    if (!strikeUser) {
      strikeUser = new StrikeUser({
        guildId: interaction.guildId,
        userId: targetUser.id,
        currentStrikeLevel: 1,
      });
    } else {
      strikeLevel = Math.min(strikeUser.currentStrikeLevel + 1, 4);
      strikeUser.currentStrikeLevel = strikeLevel;
    }

    await strikeUser.save();

    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    let actionTaken = 'None';

    if (targetMember) {
      const strikeKey = `strike${strikeLevel}`;
      const strikeConfig_data = strikeConfig.strikes[strikeKey];

      if (strikeConfig_data && strikeConfig_data.action && strikeConfig_data.action !== 'none') {
        const action = strikeConfig_data.action;

        if (action === 'kick') {
          await targetMember.kick(`Strike ${strikeLevel}: ${reason}`).catch(() => {});
          actionTaken = 'Kicked';
        } else if (action === 'timeout') {
          const durationMs = strikeConfig_data.duration * 60 * 1000;
          await targetMember.timeout(durationMs, `Strike ${strikeLevel}: ${reason}`).catch(() => {});
          actionTaken = `Timed out for ${strikeConfig_data.duration}m`;
        } else if (action === 'ban') {
          await targetMember.ban({ reason: `Strike ${strikeLevel}: ${reason}` }).catch(() => {});
          actionTaken = 'Banned';
        }
      }

      if (strikeConfig_data && strikeConfig_data.roleId) {
        const role = interaction.guild.roles.cache.get(strikeConfig_data.roleId);
        if (role) {
          await targetMember.roles.add(role).catch(() => {});
        }
      }

      const warningNote = strikeLevel === 4
        ? '\n> **This is a final warning.** Further violations may result in a permanent ban.\n'
        : strikeLevel === 3
        ? '\n> **This is strike 3.** One more violation may result in a ban.\n'
        : '';

      const strikeDM = new EmbedBuilder()
        .setColor(0xF23F43)
        .setTitle('Strike Notice')
        .setDescription(
          `You have received a strike on **${interaction.guild.name}**.\n\n` +
          `**Strike Level:** ${strikeLevel} / 4\n` +
          `**Reason:** ${reason}\n` +
          `**Issued by:** ${interaction.user.username}\n` +
          `**Action taken:** ${actionTaken}\n` +
          warningNote +
          '\n-# Contact server staff if you believe this was issued in error.'
        )
        .setTimestamp()
        .setFooter({ text: interaction.guild.name });

      await targetUser.send({ embeds: [strikeDM] }).catch(() => {});
    }

    const config = await Config.findOne({ guildId: interaction.guildId });
    if (config && config.logChannelId) {
      const logChannel = await interaction.guild.channels.fetch(config.logChannelId).catch(() => null);
      if (logChannel && logChannel.isTextBased()) {
        const logEmbed = new EmbedBuilder()
          .setColor(0xF23F43)
          .setTitle(`Strike Issued - Level ${strikeLevel} / 4`)
          .setDescription(
            `**User:** ${targetUser.username} (${targetUser})\n` +
            `**Issued by:** ${interaction.user.username}\n` +
            `**Reason:** ${reason}\n` +
            `**Action:** ${actionTaken}`
          )
          .setTimestamp()
          .setFooter({ text: 'RPM' });

        await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
      }
    }

    return interaction.reply({
      embeds: [successEmbed(
        `Strike Issued - ${targetUser.username}`,
        `**Level:** ${strikeLevel} / 4\n**Action:** ${actionTaken}\n**Reason:** ${reason}`
      )],
      flags: 64,
    });
  } catch (error) {
    console.error('Error striking member:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while striking the member.')],
      flags: 64,
    });
  }
}
