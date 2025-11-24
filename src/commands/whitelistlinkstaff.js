import { SlashCommandBuilder } from 'discord.js';
import Config from '../models/Config.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';
import { isAdmin } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('whitelistlinkstaff')
  .setDescription('Toggle whether bot staff can bypass anti-promoting and send invite links (Admin/Staff)')
  .addBooleanOption(option =>
    option
      .setName('enabled')
      .setDescription('Allow bot staff to send invite links without deletion')
      .setRequired(true)
  );

export async function execute(interaction) {
  if (!await isAdmin(interaction.member)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. Only administrators can manage this setting.')],
      flags: 64,
    });
  }

  const enabled = interaction.options.getBoolean('enabled');

  try {
    let config = await Config.findOne({ guildId: interaction.guildId }) || new Config({ guildId: interaction.guildId });

    config.staffCanBypassLinks = enabled;
    await config.save();

    const status = enabled ? 'enabled' : 'disabled';
    const description = enabled 
      ? 'Bot staff members can now send invite links without deletion.'
      : 'Bot staff members can no longer send invite links without deletion. All staff are subject to anti-promoting rules.';

    return interaction.reply({
      embeds: [successEmbed('Staff Link Bypass Updated', description)],
      flags: 64,
    });
  } catch (error) {
    console.error('Error updating staff link bypass setting:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while updating the setting.')],
      flags: 64,
    });
  }
}
