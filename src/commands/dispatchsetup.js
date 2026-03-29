import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } from 'discord.js';
import { isAdmin } from '../utils/permissions.js';
import { errorEmbed } from '../utils/embedBuilder.js';

export const data = new SlashCommandBuilder()
  .setName('dispatchsetup')
  .setDescription('Configure the AI Voice Dispatch system (Admin only)');

export async function execute(interaction) {
  if (!await isAdmin(interaction.member)) {
    return interaction.reply({
      embeds: [errorEmbed('Only server administrators can configure the AI dispatch system.')],
      flags: 64,
    });
  }

  const hasApiKey = !!(process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY);
  const warning = hasApiKey
    ? ''
    : '\n\n⚠️ **No AI key set.** Set `GROQ_API_KEY` (free at console.groq.com) or `OPENAI_API_KEY` to enable AI transcription, responses, and TTS.';

  const menu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('dispatch_setup_menu')
      .setPlaceholder('Select an option...')
      .addOptions(
        { label: 'Set Dispatch Channel', value: 'set_dispatch_channel', description: 'Text channel for AI dispatch logs and responses' },
        { label: 'Set Status Board Channel', value: 'set_status_channel', description: 'Text channel for the live officer status board' },
        { label: 'Add Patrol Voice Channel', value: 'add_patrol_channel', description: 'Voice channel the bot will listen to' },
        { label: 'Set Traffic Stop Channel', value: 'set_stop_channel', description: 'Voice channel officers are moved to during 10-11' },
        { label: '🔌 Enable / Disable System', value: 'toggle_system', description: 'Turn the entire dispatch system on or off' },
        { label: '🤖 Toggle AI Responses', value: 'toggle_ai', description: 'Enable or disable AI-generated dispatcher responses' },
        { label: '🗑️ Remove Patrol Channel', value: 'remove_patrol_channel', description: 'Stop monitoring a voice channel' },
        { label: '📋 View Settings', value: 'view_settings', description: 'See current configuration' },
        { label: '✓ Finish Setup', value: 'setup_done', description: 'Close the setup menu' }
      )
  );

  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('AI Dispatch Setup')
        .setDescription(`Configure the AI-powered voice dispatch system. Officers speak in monitored voice channels — the bot transcribes their call, generates a realistic dispatcher response, and updates the live status board.${warning}`)
        .setFooter({ text: 'EverLink' }),
    ],
    components: [menu],
    flags: 64,
  });
}
