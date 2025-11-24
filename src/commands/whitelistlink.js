import { SlashCommandBuilder } from 'discord.js';
import Config from '../models/Config.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('whitelistlink')
  .setDescription('Add an invite link to the whitelist (Admin/Staff)')
  .addStringOption(option =>
    option
      .setName('link')
      .setDescription('The Discord invite link to whitelist (e.g., https://discord.gg/xyz)')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('action')
      .setDescription('Add or remove the link')
      .setRequired(true)
      .addChoices(
        { name: 'whitelistlink', value: 'add' },
        { name: 'whitelistlink', value: 'remove' }
      )
  );

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. This is a staff-only command.')],
      flags: 64,
    });
  }

  const link = interaction.options.getString('link').trim();
  const action = interaction.options.getString('action');

  try {
    let config = await Config.findOne({ guildId: interaction.guildId }) || new Config({ guildId: interaction.guildId });

    if (action === 'add') {
      if (config.whitelistedInviteLinks.includes(link)) {
        return interaction.reply({
          embeds: [errorEmbed('This link is already whitelisted.')],
          flags: 64,
        });
      }
      config.whitelistedInviteLinks.push(link);
      await config.save();
      return interaction.reply({
        embeds: [successEmbed('Link Whitelisted', `The invite link has been added to the whitelist.\n\nLink: ${link}`)],
        flags: 64,
      });
    } else {
      if (!config.whitelistedInviteLinks.includes(link)) {
        return interaction.reply({
          embeds: [errorEmbed('This link is not in the whitelist.')],
          flags: 64,
        });
      }
      config.whitelistedInviteLinks = config.whitelistedInviteLinks.filter(l => l !== link);
      await config.save();
      return interaction.reply({
        embeds: [successEmbed('Link Removed', `The invite link has been removed from the whitelist.\n\nLink: ${link}`)],
        flags: 64,
      });
    }
  } catch (error) {
    console.error('Error managing whitelist:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while managing the whitelist.')],
      flags: 64,
    });
  }
}
