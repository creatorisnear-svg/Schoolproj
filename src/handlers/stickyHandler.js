import Sticky from '../models/Sticky.js';

export async function handleStickyMessages(message) {
  if (!message.guild) return;

  try {
    const sticky = await Sticky.findOne({ guildId: message.guildId, channelId: message.channelId });

    if (!sticky) return;

    // Don't count any bot messages (including the sticky message itself)
    if (message.author.bot) return;

    console.log(`📌 Found sticky message in ${message.guild.name} #${message.channel.name}, count: ${sticky.messageCount}`);

    // Increment message count
    sticky.messageCount += 1;
    console.log(`📌 Updated message count to: ${sticky.messageCount}`);

    // If 1 or more messages have been sent after the sticky, repost it
    if (sticky.messageCount >= 1) {
      console.log(`📌 Reposting sticky message...`);
      try {
        // Delete the old sticky message
        const oldMessage = await message.channel.messages.fetch(sticky.messageId).catch(() => null);
        console.log(`📌 Old message fetch result:`, oldMessage ? 'found' : 'not found');
        if (oldMessage) {
          await oldMessage.delete().catch((err) => {
            console.log(`📌 Could not delete old message (might be already deleted):`, err.message);
          });
          console.log(`📌 Deleted old sticky message`);
        }

        // Post the new sticky message
        const formattedMessage = `__**Stickied Message:**__\n\n${sticky.messageContent}`;
        const newStickyMessage = await message.channel.send(formattedMessage);
        console.log(`📌 Posted new sticky message with ID: ${newStickyMessage.id}`);

        // Update the database
        sticky.messageId = newStickyMessage.id;
        sticky.messageCount = 0;
        await sticky.save();

        console.log(`Reposted sticky message in ${message.guild.name} #${message.channel.name}`);
      } catch (error) {
        console.error('❌ Error reposting sticky message:', error);
      }
    }
  } catch (error) {
    console.error('❌ Error handling sticky messages:', error);
  }
}
