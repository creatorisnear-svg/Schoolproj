import { SlashCommandBuilder, ChannelType } from 'discord.js';
import DutyConfig from '../models/DutyConfig.js';
import { checkStaffPermission } from '../utils/permissions.js';
import { buildRecap } from '../utils/sessionRecap.js';

export const data = new SlashCommandBuilder()
  .setName('recap')
  .setDescription('Session recaps: patrol time, 911 calls, arrests, tickets and the top officers')
  .addSubcommand((s) => s
    .setName('now')
    .setDescription('Post a recap of the last few hours in this channel')
    .addIntegerOption((o) => o
      .setName('hours')
      .setDescription('How far back, 1 to 12 hours. Default 4')
      .setMinValue(1)
      .setMaxValue(12)))
  .addSubcommand((s) => s
    .setName('channel')
    .setDescription('Where recaps go when the last officer goes off patrol')
    .addChannelOption((o) => o
      .setName('channel')
      .setDescription('The channel for recaps')
      .setRequired(true)
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
  .addSubcommand((s) => s
    .setName('off')
    .setDescription('Stop posting recaps by themselves. /recap now still works'));

export async function execute(interaction) {
  if (!interaction.inGuild()) return;
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({ content: 'Only staff and administrators can use recaps.', flags: 64 });
  }
  const guildId = interaction.guildId;
  const sub = interaction.options.getSubcommand();

  if (sub === 'now') {
    await interaction.deferReply();
    const hours = interaction.options.getInteger('hours') || 4;
    const to = new Date();
    const payload = await buildRecap(interaction.guild, new Date(to.getTime() - hours * 3600000), to);
    if (!payload) {
      return interaction.editReply({ content: 'Nothing to recap in the last ' + hours + (hours === 1 ? ' hour' : ' hours') + ': no patrol time, 911 calls, arrests or tickets.' });
    }
    return interaction.editReply(payload);
  }

  if (sub === 'channel') {
    const channel = interaction.options.getChannel('channel');
    await DutyConfig.findOneAndUpdate({ guildId }, { $set: { recapChannelId: channel.id, recapOff: false } }, { upsert: true });
    return interaction.reply({
      content: 'Session recaps will be posted in <#' + channel.id + '> when the last officer goes off patrol. They use Patrol Hours, which you can set up in `/setup`.',
      flags: 64,
    });
  }

  await DutyConfig.findOneAndUpdate({ guildId }, { $set: { recapOff: true } }, { upsert: true });
  return interaction.reply({ content: 'Recaps are no longer posted by themselves. `/recap now` still works, and `/recap channel` turns them back on.', flags: 64 });
}
