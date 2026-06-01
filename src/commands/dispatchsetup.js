import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } from 'discord.js';
import { isAdmin } from '../utils/permissions.js';
import { errorEmbed } from '../utils/embedBuilder.js';
import { checkFeatureAccess } from '../utils/premiumCheck.js';

export const data = new SlashCommandBuilder()
  .setName('dispatchsetup')
  .setDescription('Configure the AI Voice Dispatch system (Premium only)');

export async function execute(interaction) {
  if (!await isAdmin(interaction.member)) {
    return interaction.reply({
      embeds: [errorEmbed('Only server administrators can configure the dispatch system.')],
      flags: 64,
    });
  }

  const access = await checkFeatureAccess(interaction.guildId, 'dispatch');
  if (!access.allowed) {
    return interaction.reply({
      embeds: [errorEmbed('Premium Required', 'AI Voice Dispatch is a **Premium** feature.\nUse `/activatepremium` with a valid key to unlock it.')],
      flags: 64,
    });
  }

  const hasApiKey = !!(process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY);
  const warning = hasApiKey
    ? ''
    : '\n\n-# No AI key configured. Set `GROQ_API_KEY` or `OPENAI_API_KEY` to enable transcription and TTS.';

  const menu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('dispatch_setup_menu')
      .setPlaceholder('Select an option...')
      .addOptions(
        { label: 'Set Dispatch Channel', value: 'set_dispatch_channel', description: 'Text channel for dispatch logs' },
        { label: 'Set Status Board Channel', value: 'set_status_channel', description: 'Text channel for officer status' },
        { label: 'Add Patrol Voice Channel', value: 'add_patrol_channel', description: 'Voice channel to monitor' },
        { label: 'Set Traffic Stop Channel', value: 'set_stop_channel', description: 'Voice channel for 10-11 moves' },
        { label: 'Enable / Disable System', value: 'toggle_system', description: 'Turn dispatch on or off' },
        { label: 'Toggle AI Responses', value: 'toggle_ai', description: 'Enable or disable AI responses' },
        { label: 'Remove Patrol Channel', value: 'remove_patrol_channel', description: 'Stop monitoring a channel' },
        { label: 'View Settings', value: 'view_settings', description: 'See current configuration' },
        { label: 'Done', value: 'setup_done', description: 'Close setup' }
      )
  );

  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor('#2d2d2d')
        .setTitle('Dispatch Setup')
        .setDescription(`Configure the AI voice dispatch system. Officers speak in monitored voice channels - the bot transcribes, responds, and updates the status board.${warning}`)
        .setFooter({ text: 'RPM' }),
    ],
    components: [menu],
    flags: 64,
  });
}
