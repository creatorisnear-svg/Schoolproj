import { SlashCommandBuilder, ChannelType, EmbedBuilder } from 'discord.js';
import DispatchConfig from '../models/DispatchConfig.js';
import { checkStaffPermission } from '../utils/permissions.js';
import { errorEmbed } from '../utils/embedBuilder.js';

export const data = new SlashCommandBuilder()
  .setName('dispatchannounce')
  .setDescription('Have AI dispatch announce a custom message in a voice channel (Staff)')
  .addStringOption(opt =>
    opt.setName('message')
      .setDescription('The message for dispatch to announce')
      .setRequired(true)
      .setMaxLength(400)
  )
  .addChannelOption(opt =>
    opt.setName('channel')
      .setDescription('Voice channel to announce in (defaults to current patrol channel)')
      .addChannelTypes(ChannelType.GuildVoice)
      .setRequired(false)
  );

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command.')],
      flags: 64,
    });
  }

  const message     = interaction.options.getString('message');
  const targetChannel = interaction.options.getChannel('channel');

  try {
    const cfg = await DispatchConfig.findOne({ guildId: interaction.guildId });
    if (!cfg?.aiEnabled) {
      return interaction.reply({
        embeds: [errorEmbed('AI dispatch is not enabled on this server. Enable it in `/dispatchconfig`.')],
        flags: 64,
      });
    }

    await interaction.deferReply({ flags: 64 });

    const { generateDispatchTTSPublic } = await import('../handlers/dispatchHandler.js');
    const { playDispatchVoice, playTTSInChannelAndReturn, getDispatchState, getCurrentChannelId } = await import('../utils/voiceListener.js');

    const audioBuffer = await generateDispatchTTSPublic(message);
    if (!audioBuffer) {
      return interaction.editReply({
        embeds: [errorEmbed('Failed to generate TTS audio. Please try again.')],
      });
    }

    const guildId          = interaction.guildId;
    const currentChannelId = getCurrentChannelId(guildId);

    if (!currentChannelId) {
      return interaction.editReply({
        embeds: [errorEmbed('Dispatch is not active in any channel right now. Make sure dispatch is configured and an officer is in a patrol channel.')],
      });
    }

    const announceInSameChannel = !targetChannel || targetChannel.id === currentChannelId;

    if (announceInSameChannel) {
      playDispatchVoice(guildId, audioBuffer);
    } else {
      // Move to target channel, announce, then return to patrol if anyone is still in it
      playTTSInChannelAndReturn(targetChannel, audioBuffer, 2000).catch(err => {
        console.error('[DispatchAnnounce] Channel return error:', err.message);
      });
    }

    const channelLine = announceInSameChannel
      ? `in the current patrol channel`
      : `in <#${targetChannel.id}> (dispatch will return to patrol after)`;

    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor('#43b581')
          .setTitle('Dispatch Announcement Sent')
          .setDescription(`> ${message}`)
          .addFields({ name: 'Channel', value: channelLine, inline: true })
          .setFooter({ text: `Announced by ${interaction.user.tag} • RPM` })
          .setTimestamp(),
      ],
    });
  } catch (err) {
    console.error('[DispatchAnnounce] Error:', err.message);
    return interaction.editReply({
      embeds: [errorEmbed('An error occurred while making the announcement.')],
    }).catch(() => {});
  }
}
