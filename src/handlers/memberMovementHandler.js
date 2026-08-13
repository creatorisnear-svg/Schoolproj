import { EmbedBuilder } from 'discord.js';
import MemberMovementConfig from '../models/MemberMovementConfig.js';

export async function handleMemberMovePanelSelect(interaction) {
  try {
    const config = await MemberMovementConfig.findOne({ guildId: interaction.guildId });

    if (!config?.enabled) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#f04747')
            .setTitle('Feature Disabled')
            .setDescription('Member Movement has been disabled by staff.')
            .setFooter({ text: 'RPM' }),
        ],
        flags: 64,
      });
    }

    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

    if (!member?.voice?.channelId) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#faa61a')
            .setTitle('Not in a Voice Channel')
            .setDescription('You must be connected to a voice channel before using this.')
            .setFooter({ text: 'RPM' }),
        ],
        flags: 64,
      });
    }

    const targetChannelId = interaction.values[0];

    if (targetChannelId === member.voice.channelId) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#faa61a')
            .setTitle('Already There')
            .setDescription('You are already in that voice channel.')
            .setFooter({ text: 'RPM' }),
        ],
        flags: 64,
      });
    }

    const targetChannel = interaction.guild.channels.cache.get(targetChannelId) ||
      await interaction.guild.channels.fetch(targetChannelId).catch(() => null);

    if (!targetChannel) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#f04747')
            .setTitle('Channel Not Found')
            .setDescription('That voice channel could not be found. It may have been deleted.')
            .setFooter({ text: 'RPM' }),
        ],
        flags: 64,
      });
    }

    await member.voice.setChannel(targetChannelId);

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor('#43b581')
          .setTitle('Moved')
          .setDescription(`You have been moved to **${targetChannel.name}**.`)
          .setFooter({ text: 'RPM' }),
      ],
      flags: 64,
    });
  } catch (err) {
    console.error('[MemberMovement] Panel select error:', err.message);
    const msg = err.code === 50013
      ? 'You do not have permission to join that channel.'
      : 'Something went wrong. Make sure you are in a voice channel and try again.';
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor('#f04747')
          .setTitle('Move Failed')
          .setDescription(msg)
          .setFooter({ text: 'RPM' }),
      ],
      flags: 64,
    }).catch(() => {});
  }
}
