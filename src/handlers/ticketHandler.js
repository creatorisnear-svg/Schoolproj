import TicketConfig from '../models/TicketConfig.js';
import Ticket from '../models/Ticket.js';
import { EmbedBuilder, ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelSelectMenuBuilder, RoleSelectMenuBuilder } from 'discord.js';
import { infoEmbed, successEmbed, errorEmbed } from '../utils/embedBuilder.js';

// Store pending ticket type creation data
const pendingTicketTypes = new Map();

export async function handleTicketSetupMenu(interaction) {
  const choice = interaction.values[0];

  try {
    const ticketConfig = await TicketConfig.findOne({ guildId: interaction.guildId });

    if (!ticketConfig) {
      return interaction.reply({
        embeds: [errorEmbed('Ticket system not found.')],
        ephemeral: true,
      });
    }

    if (choice === 'select_channel') {
      const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('ticketsupport_panel_channel')
        .setPlaceholder('Select the channel for the ticket panel...')
        .addChannelTypes(ChannelType.GuildText);

      const row = new ActionRowBuilder().addComponents(channelSelect);

      return interaction.reply({
        content: 'Select the channel where the ticket panel should be sent:',
        components: [row],
        ephemeral: true,
      });
    }

    if (choice === 'add_type') {
      const modal = new ModalBuilder()
        .setCustomId('ticketsupport_add_type_modal')
        .setTitle('Add Ticket Type')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('ticket_type_name')
              .setLabel('Ticket Type Name')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('e.g., Staff Report')
              .setRequired(true)
          )
        );

      return interaction.showModal(modal);
    }

    if (choice === 'view_types') {
      if (ticketConfig.ticketTypes.length === 0) {
        return interaction.reply({
          embeds: [infoEmbed('Ticket Types', 'No ticket types configured yet.')],
          ephemeral: true,
        });
      }

      const typesList = ticketConfig.ticketTypes
        .map((t, i) => `${i + 1}. **${t.label}** - ${t.allowedRoleIds.length} role(s) allowed`)
        .join('\n');

      return interaction.reply({
        embeds: [infoEmbed('Configured Ticket Types', typesList)],
        ephemeral: true,
      });
    }

    if (choice === 'send_panel') {
      if (ticketConfig.ticketTypes.length === 0) {
        return interaction.reply({
          embeds: [errorEmbed('Please add at least one ticket type before sending the panel.')],
          ephemeral: true,
        });
      }

      if (!ticketConfig.panelChannelId) {
        return interaction.reply({
          embeds: [errorEmbed('Please select a channel for the panel first.')],
          ephemeral: true,
        });
      }

      await sendTicketPanel(interaction, ticketConfig);
    }

    if (choice === 'setup_done') {
      return interaction.reply({
        embeds: [successEmbed('Setup Complete', 'Your ticket system is ready to use!')],
        ephemeral: true,
      });
    }
  } catch (error) {
    console.error('Error in ticket setup menu:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handleTicketSetupModal(interaction) {
  const ticketTypeName = interaction.fields.getTextInputValue('ticket_type_name');

  try {
    const ticketConfig = await TicketConfig.findOne({ guildId: interaction.guildId });

    if (!ticketConfig) {
      return interaction.reply({
        embeds: [errorEmbed('Ticket system not found.')],
        ephemeral: true,
      });
    }

    // Check if type already exists
    if (ticketConfig.ticketTypes.some(t => t.label === ticketTypeName)) {
      return interaction.reply({
        embeds: [errorEmbed(`"${ticketTypeName}" already exists.`)],
        ephemeral: true,
      });
    }

    // Store pending type and ask for roles
    const tempId = Date.now().toString();
    pendingTicketTypes.set(tempId, { label: ticketTypeName, guildId: interaction.guildId });

    const roleSelect = new RoleSelectMenuBuilder()
      .setCustomId(`ticketsupport_type_roles_${tempId}`)
      .setPlaceholder('Select roles that can view this ticket type...')
      .setMinValues(1)
      .setMaxValues(25);

    const row = new ActionRowBuilder().addComponents(roleSelect);

    return interaction.reply({
      content: `Select which roles can view **${ticketTypeName}** tickets:`,
      components: [row],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error in ticket add type modal:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handleTicketChannelSelect(interaction) {
  const channelId = interaction.values[0];

  try {
    const ticketConfig = await TicketConfig.findOne({ guildId: interaction.guildId });

    if (!ticketConfig) {
      return interaction.reply({
        embeds: [errorEmbed('Ticket system not found.')],
        ephemeral: true,
      });
    }

    // Verify the channel exists and is text-based
    const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);

    if (!channel || !channel.isTextBased()) {
      return interaction.reply({
        embeds: [errorEmbed('Invalid channel selected.')],
        ephemeral: true,
      });
    }

    // Update config
    ticketConfig.panelChannelId = channelId;
    await ticketConfig.save();

    return interaction.reply({
      embeds: [successEmbed('Channel Selected', `Panel will be sent to <#${channelId}>`)],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error selecting ticket panel channel:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handleTicketRoleSelect(interaction) {
  const customIdParts = interaction.customId.split('_');
  const tempId = customIdParts[customIdParts.length - 1];
  const selectedRoleIds = interaction.values;

  try {
    const pending = pendingTicketTypes.get(tempId);

    if (!pending) {
      return interaction.reply({
        embeds: [errorEmbed('Session expired. Please try again.')],
        ephemeral: true,
      });
    }

    const ticketConfig = await TicketConfig.findOne({ guildId: pending.guildId });

    if (!ticketConfig) {
      pendingTicketTypes.delete(tempId);
      return interaction.reply({
        embeds: [errorEmbed('Ticket system not found.')],
        ephemeral: true,
      });
    }

    // Add the new ticket type
    ticketConfig.ticketTypes.push({
      id: Date.now().toString(),
      label: pending.label,
      allowedRoleIds: selectedRoleIds,
      createdAt: new Date(),
    });

    await ticketConfig.save();
    pendingTicketTypes.delete(tempId);

    return interaction.reply({
      embeds: [successEmbed('Ticket Type Added', `"${pending.label}" has been added with ${selectedRoleIds.length} role(s).`)],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error selecting ticket roles:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

async function sendTicketPanel(interaction, ticketConfig) {
  try {
    const channel = await interaction.guild.channels.fetch(ticketConfig.panelChannelId).catch(() => null);

    if (!channel) {
      return interaction.reply({
        embeds: [errorEmbed('Ticket panel channel not found.')],
        ephemeral: true,
      });
    }

    // Create the panel embed
    const panelEmbed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Support Tickets')
      .setDescription('Select a button below to create a support ticket.')
      .setFooter({ text: 'EverLink' })
      .setTimestamp();

    // Create buttons for each ticket type
    const buttons = ticketConfig.ticketTypes.map(type =>
      new ButtonBuilder()
        .setCustomId(`ticket_create_${type.id}`)
        .setLabel(type.label)
        .setStyle(ButtonStyle.Primary)
    );

    // Split buttons into rows (5 per row max)
    const rows = [];
    for (let i = 0; i < buttons.length; i += 5) {
      const row = new ActionRowBuilder().addComponents(buttons.slice(i, i + 5));
      rows.push(row);
    }

    // Send the panel
    await channel.send({
      embeds: [panelEmbed],
      components: rows,
    });

    return interaction.reply({
      embeds: [successEmbed('Panel Sent', `Ticket panel sent to <#${ticketConfig.panelChannelId}>`)],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error sending ticket panel:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while sending the panel.')],
      ephemeral: true,
    });
  }
}

export async function handleTicketButtonClick(interaction) {
  const customId = interaction.customId;

  if (!customId.startsWith('ticket_create_')) {
    return;
  }

  const ticketTypeId = customId.replace('ticket_create_', '');

  try {
    const ticketConfig = await TicketConfig.findOne({ guildId: interaction.guildId });

    if (!ticketConfig) {
      return interaction.reply({
        content: '❌ Ticket system is not configured.',
        flags: 64,
      });
    }

    const ticketType = ticketConfig.ticketTypes.find(t => t.id === ticketTypeId);

    if (!ticketType) {
      return interaction.reply({
        content: '❌ Ticket type not found.',
        flags: 64,
      });
    }

    const guild = interaction.guild;
    const user = interaction.user;

    // Generate unique ticket ID
    const ticketCount = await Ticket.countDocuments({ guildId: interaction.guildId });
    const ticketId = `${ticketType.label.toLowerCase().replace(/\s+/g, '-')}-${ticketCount + 1}`;

    // Create ticket channel
    const channel = await guild.channels.create({
      name: ticketId,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: user.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        },
        ...ticketType.allowedRoleIds.map(roleId => ({
          id: roleId,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        })),
      ],
    });

    // Save ticket to database
    await Ticket.create({
      guildId: interaction.guildId,
      ticketId,
      userId: user.id,
      channelId: channel.id,
      ticketType: ticketType.label,
    });

    // Send welcome message in ticket channel
    const welcomeEmbed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle(`${ticketType.label} Ticket`)
      .setDescription(`Welcome ${user}! A staff member will be with you shortly.`)
      .addFields(
        { name: 'Ticket ID', value: ticketId, inline: true },
        { name: 'Type', value: ticketType.label, inline: true }
      )
      .setFooter({ text: 'EverLink' })
      .setTimestamp();

    await channel.send({
      content: `${user}`,
      embeds: [welcomeEmbed],
    });

    // Reply to user
    await interaction.reply({
      content: `✅ Ticket created! Check ${channel}`,
      flags: 64,
    });
  } catch (error) {
    console.error('Error creating ticket:', error);
    await interaction.reply({
      content: '❌ An error occurred while creating the ticket.',
      flags: 64,
    });
  }
}

export { pendingTicketTypes };
