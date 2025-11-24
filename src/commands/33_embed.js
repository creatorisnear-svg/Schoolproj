import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } from 'discord.js';
import Staff from '../models/Staff.js';
import { errorEmbed, successEmbed } from '../utils/embedBuilder.js';

export const data = new SlashCommandBuilder()
  .setName('embed')
  .setDescription('Create and send an embed message (Admin/Staff)')
  .addStringOption(option =>
    option
      .setName('message')
      .setDescription('The message content to embed')
      .setRequired(true)
      .setMaxLength(4000)
  )
  .addChannelOption(option =>
    option
      .setName('channel')
      .setDescription('Channel to send the embed (optional, defaults to current channel)')
      .setRequired(false)
      .addChannelTypes(ChannelType.GuildText)
  )
  .addStringOption(option =>
    option
      .setName('title')
      .setDescription('Title for the embed (optional)')
      .setRequired(false)
      .setMaxLength(256)
  )
  .addStringOption(option =>
    option
      .setName('color')
      .setDescription('Embed color in hex format (optional, default: #2E2E2E)')
      .setRequired(false)
      .setMaxLength(7)
  );

export async function execute(interaction) {
  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const message = interaction.options.getString('message');
  const channel = interaction.options.getChannel('channel') || interaction.channel;
  const title = interaction.options.getString('title');
  const colorInput = interaction.options.getString('color') || '#2E2E2E';

  try {
    // Check if user is staff or admin
    const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
    
    let isStaff = false;
    if (!isAdmin) {
      const staffRecords = await Staff.findOne({
        guildId,
        $or: [
          { type: 'user', userId },
          { type: 'role', roleId: { $in: interaction.member.roles.cache.map(r => r.id) } },
        ],
      });
      isStaff = !!staffRecords;
    }

    if (!isAdmin && !isStaff) {
      return interaction.reply({
        embeds: [errorEmbed('Only admins and staff can use this command.')],
        flags: 64,
      });
    }

    // Validate color format
    if (!colorInput.match(/^#[0-9A-F]{6}$/i)) {
      return interaction.reply({
        embeds: [errorEmbed('Invalid color format. Use hex format like #FF0000')],
        flags: 64,
      });
    }

    // Create embed
    const embed = new EmbedBuilder()
      .setColor(colorInput)
      .setDescription(message)
      .setTimestamp()
      .setFooter({ text: 'EverLink' });

    if (title) {
      embed.setTitle(title);
    }

    // Check if bot has permission to send messages in the target channel
    if (!channel.permissionsFor(interaction.client.user).has(PermissionFlagsBits.SendMessages)) {
      return interaction.reply({
        embeds: [errorEmbed(`I don't have permission to send messages in ${channel}`)],
        flags: 64,
      });
    }

    // Send embed to channel
    await channel.send({ embeds: [embed] });

    return interaction.reply({
      embeds: [successEmbed('Embed Sent', `Your embed has been posted to ${channel}`)],
      flags: 64,
    });
  } catch (error) {
    console.error('Error in embed command:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while creating the embed.')],
      flags: 64,
    });
  }
}
