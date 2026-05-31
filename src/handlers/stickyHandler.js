import Sticky from '../models/Sticky.js';

const STICKY_THRESHOLD = 5;

export async function handleStickyMessages(message) {
  if (!message.guild) return;

  try {
    const sticky = await Sticky.findOne({ guildId: message.guildId, channelId: message.channelId });
    if (!sticky) return;

    sticky.messageCount += 1;

    if (sticky.messageCount >= STICKY_THRESHOLD) {
      const oldMessage = await message.channel.messages.fetch(sticky.messageId).catch(() => null);
      if (oldMessage && oldMessage.author.id === message.client.user.id) {
        await oldMessage.delete().catch(() => {});
      }

      const formattedMessage = `__**Stickied Message:**__\n\n${sticky.messageContent}`;
      const newStickyMessage = await message.channel.send(formattedMessage);

      sticky.messageId = newStickyMessage.id;
      sticky.messageCount = 0;
      await sticky.save();
    } else {
      await sticky.save();
    }
  } catch (error) {
    console.error('[Sticky] Error handling sticky message:', error.message);
  }
}
