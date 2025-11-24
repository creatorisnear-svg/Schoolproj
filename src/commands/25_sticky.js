import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import Sticky from '../models/Sticky.js';
import Staff from '../models/Staff.js';
import { errorEmbed, successEmbed } from '../utils/embedBuilder.js';

export const data = new SlashCommandBuilder()
  .setName('25sticky')
  .setDescription('Create a sticky message that auto-reposts after 3 messages')
  .addStringOption(option =>
    option
      .setName('message')
      .setDescription('The message content to make sticky')
      .setRequired(true)
      .setMaxLength(2000)
  )
  .addChannelOption(option =>
    option
      .setName('channel')
      .setDescription('Channel to post sticky message (optional, defaults to current channel)')
      .setRequired(false)
      .addChannelTypes(ChannelType.GuildText)
  );

export async function execute(interaction) {
  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const messageContent = interaction.options.getString('message');
  const channel = interaction.options.getChannel('channel') || interaction.channel;

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
        content: '❌ Only admins and staff can use this command.',
        flags: 64,
      });
    }

    // Delete any existing sticky message in this channel
    const existingSticky = await Sticky.findOne({ guildId, channelId: channel.id });
    if (existingSticky) {
      try {
        const msg = await channel.messages.fetch(existingSticky.messageId).catch(() => null);
        if (msg) {
          await msg.delete();
        }
      } catch (error) {
        console.error('Error deleting old sticky message:', error);
      }
      await Sticky.deleteOne({ _id: existingSticky._id });
    }

    // Format the sticky message
    const formattedMessage = `__**Stickied Message:**__\n\n${messageContent}`;

    // Post the sticky message
    console.log(`📌 Posting sticky message to ${channel.name}...`);
    const stickyMessage = await channel.send(formattedMessage);
    console.log(`📌 Sticky message posted with ID: ${stickyMessage.id}`);

    // Save to database
    console.log(`📌 Saving sticky to database for guild ${guildId}, channel ${channel.id}...`);
    const savedSticky = await Sticky.create({
      guildId,
      channelId: channel.id,
      messageId: stickyMessage.id,
      messageContent,
      createdBy: userId,
      messageCount: 0,
    });
    console.log(`📌 Sticky saved to database with ID: ${savedSticky._id}`);

    return interaction.reply({
      content: `✅ Sticky message created in ${channel}`,
      flags: 64,
    });
  } catch (error) {
    console.error('Error creating sticky message:', error);
    return interaction.reply({
      content: '❌ Failed to create sticky message.',
      flags: 64,
    });
  }
}
