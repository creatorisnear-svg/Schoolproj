import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import Sticky from '../models/Sticky.js';
import Staff from '../models/Staff.js';
import { errorEmbed, successEmbed } from '../utils/embedBuilder.js';
import { getGuildLimits } from '../utils/premiumCheck.js';

export const data = new SlashCommandBuilder()
  .setName('sticky')
  .setDescription('Create or delete a sticky message that auto-reposts (Admin/Staff)')
  .addStringOption(option =>
    option
      .setName('action')
      .setDescription('Create a new sticky or delete an existing one')
      .setRequired(true)
      .addChoices(
        { name: 'Create', value: 'create' },
        { name: 'Delete', value: 'delete' }
      )
  )
  .addStringOption(option =>
    option
      .setName('message')
      .setDescription('The message content to make sticky (required for create)')
      .setRequired(false)
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
  const action = interaction.options.getString('action');
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
        embeds: [errorEmbed('❌ Only admins and staff can use this command.')],
        flags: 64,
      });
    }

    if (action === 'create') {
      if (!messageContent) {
        return interaction.reply({
          embeds: [errorEmbed('❌ Please provide a message to make sticky.')],
          flags: 64,
        });
      }

      const existingInChannel = await Sticky.findOne({ guildId, channelId: channel.id });
      if (!existingInChannel) {
        const limits = await getGuildLimits(guildId);
        const stickyLimit = limits.characters === Infinity ? Infinity : 5;
        const stickyCount = await Sticky.countDocuments({ guildId });
        if (stickyCount >= stickyLimit) {
          return interaction.reply({
            embeds: [errorEmbed('Sticky Limit Reached', `This server has reached the maximum of **${stickyLimit} sticky messages**. Upgrade to **Premium** with \`/activatepremium\` for unlimited stickies.`)],
            flags: 64,
          });
        }
      }

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
        embeds: [successEmbed(`✅ Sticky Message Created`, `Sticky message created in ${channel}`)],
        flags: 64,
      });
    }

    // Handle DELETE action
    if (action === 'delete') {
      const existingSticky = await Sticky.findOne({ guildId, channelId: channel.id });

      if (!existingSticky) {
        return interaction.reply({
          embeds: [errorEmbed(`❌ No sticky message found in ${channel}`)],
          flags: 64,
        });
      }

      // Delete the sticky message from Discord
      try {
        const msg = await channel.messages.fetch(existingSticky.messageId).catch(() => null);
        if (msg) {
          await msg.delete();
          console.log(`📌 Sticky message deleted from ${channel.name}`);
        }
      } catch (error) {
        console.error('Error deleting sticky message:', error);
      }

      // Delete from database
      await Sticky.deleteOne({ _id: existingSticky._id });
      console.log(`📌 Sticky removed from database for channel ${channel.id}`);

      return interaction.reply({
        embeds: [successEmbed(`✅ Sticky Message Deleted`, `Sticky message removed from ${channel}`)],
        flags: 64,
      });
    }
  } catch (error) {
    console.error('Error managing sticky message:', error);
    return interaction.reply({
      embeds: [errorEmbed('❌ An error occurred while managing the sticky message.')],
      flags: 64,
    });
  }
}
