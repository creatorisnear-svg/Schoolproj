import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, EmbedBuilder } from 'discord.js';
import { errorEmbed, successEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('setrolepermissions')
  .setDescription('Set all permissions on a role except Administrator (Staff only)')
  .addRoleOption(option =>
    option
      .setName('role')
      .setDescription('The role to configure')
      .setRequired(true)
  );

export async function execute(interaction) {
  try {
    if (!await checkStaffPermission(interaction)) {
      return interaction.reply({
        embeds: [errorEmbed('You do not have permission to use this command. Only staff can configure role permissions.')],
        flags: 64,
      });
    }

    const role = interaction.options.getRole('role');

    if (!role) {
      return interaction.reply({
        embeds: [errorEmbed('Role not found.')],
        flags: 64,
      });
    }

    // All permissions EXCEPT Administrator
    const permissions = [
      PermissionFlagsBits.CreateInstantInvite,
      PermissionFlagsBits.KickMembers,
      PermissionFlagsBits.BanMembers,
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.ManageGuild,
      PermissionFlagsBits.AddReactions,
      PermissionFlagsBits.ViewAuditLog,
      PermissionFlagsBits.PrioritySpeaker,
      PermissionFlagsBits.Stream,
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.SendTTSMessages,
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.AttachFiles,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.MentionEveryone,
      PermissionFlagsBits.UseExternalEmojis,
      PermissionFlagsBits.ViewGuildInsights,
      PermissionFlagsBits.Connect,
      PermissionFlagsBits.Speak,
      PermissionFlagsBits.MuteMembers,
      PermissionFlagsBits.DeafenMembers,
      PermissionFlagsBits.MoveMembers,
      PermissionFlagsBits.UseVAD,
      PermissionFlagsBits.ChangeNickname,
      PermissionFlagsBits.ManageNicknames,
      PermissionFlagsBits.ManageRoles,
      PermissionFlagsBits.ManageWebhooks,
      PermissionFlagsBits.ManageEmojisAndStickers,
      PermissionFlagsBits.ManageGuildExpressions,
      PermissionFlagsBits.UseApplicationCommands,
      PermissionFlagsBits.RequestToSpeak,
      PermissionFlagsBits.ManageEvents,
      PermissionFlagsBits.ModerateMembers,
      PermissionFlagsBits.SendVoiceMessages,
      PermissionFlagsBits.ViewCreatorMonetizationAnalytics,
      PermissionFlagsBits.UseSoundboard,
      PermissionFlagsBits.UseExternalSounds,
      PermissionFlagsBits.SendPolls,
      PermissionFlagsBits.UseExternalApps,
    ];

    // Update the role with all these permissions
    await role.edit({
      permissions: new PermissionsBitField(permissions),
    });

    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('✅ Role Permissions Updated')
      .setDescription(`Successfully set **all permissions** on ${role} except **Administrator**.`)
      .addFields(
        { name: 'Role', value: `${role} (ID: ${role.id})`, inline: false },
        { name: 'Permissions Applied', value: `${permissions.length} permissions`, inline: false }
      )
      .setFooter({ text: 'EverLink' })
      .setTimestamp();

    return interaction.reply({
      embeds: [embed],
      flags: 64,
    });
  } catch (error) {
    console.error('Error setting role permissions:', error);
    return interaction.reply({
      embeds: [errorEmbed(`Failed to set permissions: ${error.message}`)],
      flags: 64,
    });
  }
}
