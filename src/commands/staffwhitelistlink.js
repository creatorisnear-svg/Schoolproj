import { SlashCommandBuilder } from 'discord.js';
import Config from '../models/Config.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';
import { isAdmin } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('staffwhitelistlink')
  .setDescription('Add or remove a staff member from invite link whitelist (Admin only)')
  .addUserOption(option =>
    option
      .setName('user')
      .setDescription('The staff member to whitelist')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('action')
      .setDescription('Add or remove the staff member')
      .setRequired(true)
      .addChoices(
        { name: 'Add', value: 'add' },
        { name: 'Remove', value: 'remove' }
      )
  );

export async function execute(interaction) {
  if (!await isAdmin(interaction.member)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command. Only administrators can manage staff whitelist.')],
      ephemeral: true,
    });
  }

  const user = interaction.options.getUser('user');
  const action = interaction.options.getString('action');

  try {
    let config = await Config.findOne({ guildId: interaction.guildId }) || new Config({ guildId: interaction.guildId });

    if (action === 'add') {
      if (config.whitelistedStaffIds.includes(user.id)) {
        return interaction.reply({
          embeds: [errorEmbed(`${user.username} is already whitelisted.`)],
          ephemeral: true,
        });
      }
      config.whitelistedStaffIds.push(user.id);
      await config.save();
      return interaction.reply({
        embeds: [successEmbed('Staff Whitelisted', `${user.username} can now share invite links without them being deleted.`)],
        ephemeral: true,
      });
    } else {
      if (!config.whitelistedStaffIds.includes(user.id)) {
        return interaction.reply({
          embeds: [errorEmbed(`${user.username} is not in the staff whitelist.`)],
          ephemeral: true,
        });
      }
      config.whitelistedStaffIds = config.whitelistedStaffIds.filter(id => id !== user.id);
      await config.save();
      return interaction.reply({
        embeds: [successEmbed('Staff Removed', `${user.username} can no longer share invite links without deletion.`)],
        ephemeral: true,
      });
    }
  } catch (error) {
    console.error('Error managing staff whitelist:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while managing the staff whitelist.')],
      ephemeral: true,
    });
  }
}
