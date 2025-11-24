import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } from 'discord.js';
import RoleRequestConfig from '../models/RoleRequestConfig.js';
import RoleRequest from '../models/RoleRequest.js';
import { errorEmbed } from '../utils/embedBuilder.js';
import { v4 as uuidv4 } from 'uuid';

export const data = new SlashCommandBuilder()
  .setName('21rolerequest')
  .setDescription('Request a role from the server');

export async function execute(interaction) {
  try {
    const roleRequestConfig = await RoleRequestConfig.findOne({ guildId: interaction.guildId });

    if (!roleRequestConfig || !roleRequestConfig.enabled) {
      return interaction.reply({
        embeds: [errorEmbed('The role request system is not enabled.')],
        ephemeral: true,
      });
    }

    if (!roleRequestConfig.roles || roleRequestConfig.roles.length === 0) {
      return interaction.reply({
        embeds: [errorEmbed('No role request types are available. Please contact an administrator.')],
        ephemeral: true,
      });
    }

    // Show menu to select which role to request
    const roleOptions = roleRequestConfig.roles.map(r => ({
      label: r.roleName || r.id,
      value: r.id,
      description: `Request the ${r.roleName} role`
    }));

    const menu = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('select_role_to_request')
          .setPlaceholder('Select a role to request...')
          .addOptions(roleOptions)
      );

    let rolesList = '**Available Roles:**\n\n';
    roleRequestConfig.roles.forEach(r => {
      rolesList += `• **${r.roleName}**\n`;
    });

    const embed = new EmbedBuilder()
      .setColor('#2E2E2E')
      .setTitle('Request a Role')
      .setDescription(rolesList)
      .setFooter({ text: 'EverLink' });

    await interaction.reply({
      embeds: [embed],
      components: [menu],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error in role request command:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}
