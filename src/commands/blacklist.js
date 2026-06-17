import { SlashCommandBuilder } from 'discord.js';
import { checkStaffPermission } from '../utils/permissions.js';
import { errorEmbed } from '../utils/embedBuilder.js';
import { checkFeatureAccess, buildPremiumEmbed } from '../utils/premiumCheck.js';
import { executeBlacklist } from '../handlers/blacklistHandler.js';

export const data = new SlashCommandBuilder()
  .setName('blacklist')
  .setDescription('Blacklist a member from the server (Admin/Staff, Premium)')
  .addStringOption(opt =>
    opt.setName('reason').setDescription('Reason for the blacklist').setRequired(true)
  )
  .addUserOption(opt =>
    opt.setName('user').setDescription('Discord user to blacklist').setRequired(false)
  )
  .addStringOption(opt =>
    opt.setName('gamertag').setDescription('Gamertag / PSN / Xbox username to blacklist').setRequired(false)
  )
  .addBooleanOption(opt =>
    opt.setName('ip_ban').setDescription('Also IP ban this person? (blocks alt accounts at verification)').setRequired(false)
  );

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command.')],
      flags: 64,
    });
  }

  const access = await checkFeatureAccess(interaction.guildId, 'blacklist');
  if (!access.allowed) {
    return interaction.reply({
      embeds: [buildPremiumEmbed('Blacklist System')],
      flags: 64,
    });
  }

  const targetUser = interaction.options.getUser('user');
  const gamertag = interaction.options.getString('gamertag');
  const reason = interaction.options.getString('reason');
  const ipBan = interaction.options.getBoolean('ip_ban') ?? false;

  if (!targetUser && !gamertag) {
    return interaction.reply({
      embeds: [errorEmbed('You must provide either a Discord user or a gamertag.')],
      flags: 64,
    });
  }

  await executeBlacklist(interaction, { targetUser, gamertag, reason, ipBan });
}
