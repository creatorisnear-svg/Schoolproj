import Sticky from '../models/Sticky.js';

export async function handleStickyMessages(message) {
  if (!message.guild) return;

  try {
    const sticky = await Sticky.findOne({ guildId: message.guildId, channelId: message.channelId });
    if (!sticky) return;

    sticky.messageCount += 1;

    if (sticky.messageCount >= 1) {
      const oldMessage = await message.channel.messages.fetch(sticky.messageId).catch(() => null);
      if (oldMessage) await oldMessage.delete().catch(() => {});

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
