import { SlashCommandBuilder } from 'discord.js';
import { checkStaffPermission } from '../utils/permissions.js';
import { errorEmbed } from '../utils/embedBuilder.js';
import { checkFeatureAccess, buildPremiumEmbed } from '../utils/premiumCheck.js';
import { executeRemoveBlacklist } from '../handlers/blacklistHandler.js';

export const data = new SlashCommandBuilder()
  .setName('removeblacklist')
  .setDescription('Remove a member from the server blacklist (Admin/Staff, Premium)')
  .addUserOption(opt =>
    opt.setName('user').setDescription('Discord user to remove from the blacklist').setRequired(false)
  )
  .addStringOption(opt =>
    opt.setName('gamertag').setDescription('Gamertag to remove from the blacklist').setRequired(false)
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

  if (!targetUser && !gamertag) {
    return interaction.reply({
      embeds: [errorEmbed('Provide either a Discord user or a gamertag to remove.')],
      flags: 64,
    });
  }

  await executeRemoveBlacklist(interaction, { targetUser, gamertag });
}
