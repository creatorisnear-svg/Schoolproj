import { EmbedBuilder } from 'discord.js';
import Config from '../models/Config.js';
import { detectDiscordInvite } from '../utils/inviteDetector.js';

export async function handleAntiPromoting(message) {
  try {
    const config = await Config.findOne({ guildId: message.guildId });

    if (!config || !config.antiPromotingEnabled || !config.logChannelId) {
      return;
    }

    // Skip bot messages and DMs
    if (message.author.bot || !message.guild) {
      return;
    }

    // Check if user is whitelisted staff/admin and staff can bypass links
    if (config.staffCanBypassLinks && (config.whitelistedStaffIds.includes(message.author.id) || message.member.permissions.has('Administrator'))) {
      return;
    }

    // Detect invite links
    const inviteLinks = detectDiscordInvite(message.content);
    if (inviteLinks.length === 0) {
      return;
    }

    console.log(`🚫 Detected ${inviteLinks.length} invite link(s) in message from ${message.author.username}`);

    // Check if any of the detected links are whitelisted
    const whitelistedLinks = Array.isArray(config.whitelistedInviteLinks) ? config.whitelistedInviteLinks : [];
    const nonWhitelistedLinks = inviteLinks.filter(link => !whitelistedLinks.includes(link));
    if (nonWhitelistedLinks.length === 0) {
      console.log(`All links are whitelisted, allowing message`);
      return;
    }

    console.log(`🚫 Found ${nonWhitelistedLinks.length} non-whitelisted link(s), deleting message`);

    // Delete the message
    await message.delete().catch(() => {});

    // Get log channel
    const logChannel = await message.guild.channels.fetch(config.logChannelId).catch(() => null);

    // Send DM to user
    const dmEmbed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('🚫 Invite Link Detected')
      .setDescription(`Your message was deleted in **${message.guild.name}** because it contained a Discord invite link.`)
      .addFields(
        { name: 'Your Message', value: message.content || 'N/A', inline: false },
        { name: 'Reason', value: 'Please do not share invite links to other servers.', inline: false }
      )
      .setTimestamp()
      .setFooter({ text: 'SARP Core' });

    await message.author.send({ embeds: [dmEmbed] }).catch(() => {});

    // Send to log channel
    if (logChannel && logChannel.isTextBased()) {
      const logEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('Invite Link Detected')
        .addFields(
          { name: 'User', value: `${message.author.username} (${message.author})`, inline: false },
          { name: 'Channel', value: `${message.channel}`, inline: false },
          { name: 'Message Content', value: message.content || 'N/A', inline: false },
          { name: 'Invite Links Found', value: nonWhitelistedLinks.join('\n') || 'N/A', inline: false }
        )
        .setTimestamp()
        .setFooter({ text: 'SARP Core' });

      await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
    }

  } catch (error) {
    console.error('Error in anti-promoting handler:', error);
  }
}
