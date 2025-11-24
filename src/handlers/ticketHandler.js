import TicketConfig from '../models/TicketConfig.js';
import Ticket from '../models/Ticket.js';
import Staff from '../models/Staff.js';
import { EmbedBuilder, ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelSelectMenuBuilder, RoleSelectMenuBuilder, StringSelectMenuBuilder } from 'discord.js';
import { infoEmbed, successEmbed, errorEmbed } from '../utils/embedBuilder.js';

// Store pending ticket type creation data
const pendingTicketTypes = new Map();
const pendingTicketCreations = new Map();

// Helper function to show main setup menu
async function showSetupMenu(interaction) {
  const menu = new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('ticketsupport_setup_menu')
        .setPlaceholder('Choose a setup option...')
        .addOptions(
          { label: 'Customize Panel Title', value: 'panel_title' },
          { label: 'Customize Panel Description', value: 'panel_description' },
          { label: 'Select Panel Channel', value: 'select_channel' },
          { label: 'Add Ticket Type', value: 'add_type' },
          { label: 'View Ticket Types', value: 'view_types' },
          { label: 'Send Panel', value: 'send_panel' },
          { label: '✅ Done - Close Setup', value: 'setup_done' }
        )
    );

  return {
    content: '**Ticket Support Setup**\n\nSelect an option below to configure your ticket system:',
    components: [menu],
    ephemeral: true,
  };
}

// Convert button color to ButtonStyle
function getButtonStyle(color) {
  const styles = {
    'Primary': ButtonStyle.Primary,
    'Secondary': ButtonStyle.Secondary,
    'Success': ButtonStyle.Success,
    'Danger': ButtonStyle.Danger,
  };
  return styles[color] || ButtonStyle.Primary;
}

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

    if (choice === 'panel_title') {
      const modal = new ModalBuilder()
        .setCustomId('ticketsupport_panel_title_modal')
        .setTitle('Customize Panel Title')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('panel_title_input')
              .setLabel('Panel Title')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('e.g., Support Tickets')
              .setValue(ticketConfig.panelTitle || 'Support Tickets')
              .setMaxLength(100)
              .setRequired(true)
          )
        );

      return interaction.showModal(modal);
    }

    if (choice === 'panel_description') {
      const modal = new ModalBuilder()
        .setCustomId('ticketsupport_panel_description_modal')
        .setTitle('Customize Panel Description')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('panel_description_input')
              .setLabel('Panel Description')
              .setStyle(TextInputStyle.Paragraph)
              .setPlaceholder('e.g., Select a button below to create a support ticket.')
              .setValue(ticketConfig.panelDescription || 'Select a button below to create a support ticket.')
              .setMaxLength(1000)
              .setRequired(true)
          )
        );

      return interaction.showModal(modal);
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
        const menuData = await showSetupMenu(interaction);
        return interaction.reply({
          ...menuData,
          embeds: [infoEmbed('Ticket Types', 'No ticket types configured yet.')],
        });
      }

      const typesList = ticketConfig.ticketTypes
        .map((t, i) => {
          const staffNote = t.includeStaff ? ' (+ Bot Staff)' : '';
          return `${i + 1}. **${t.label}** - ${t.allowedRoleIds.length} role(s) allowed${staffNote}`;
        })
        .join('\n');

      const menuData = await showSetupMenu(interaction);
      return interaction.reply({
        ...menuData,
        embeds: [infoEmbed('Configured Ticket Types', typesList)],
      });
    }

    if (choice === 'send_panel') {
      if (ticketConfig.ticketTypes.length === 0) {
        const menuData = await showSetupMenu(interaction);
        return interaction.reply({
          ...menuData,
          embeds: [errorEmbed('Please add at least one ticket type before sending the panel.')],
        });
      }

      if (!ticketConfig.panelChannelId) {
        const menuData = await showSetupMenu(interaction);
        return interaction.reply({
          ...menuData,
          embeds: [errorEmbed('Please select a channel for the panel first.')],
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

export async function handlePanelTitleModal(interaction) {
  const panelTitle = interaction.fields.getTextInputValue('panel_title_input');

  try {
    const ticketConfig = await TicketConfig.findOne({ guildId: interaction.guildId });

    if (!ticketConfig) {
      return interaction.reply({
        embeds: [errorEmbed('Ticket system not found.')],
        ephemeral: true,
      });
    }

    ticketConfig.panelTitle = panelTitle;
    await ticketConfig.save();

    const menuData = await showSetupMenu(interaction);
    return interaction.update({
      ...menuData,
      embeds: [successEmbed('Panel Title Updated', `Title set to: **${panelTitle}**`)],
    });
  } catch (error) {
    console.error('Error updating panel title:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handlePanelDescriptionModal(interaction) {
  const panelDescription = interaction.fields.getTextInputValue('panel_description_input');

  try {
    const ticketConfig = await TicketConfig.findOne({ guildId: interaction.guildId });

    if (!ticketConfig) {
      return interaction.reply({
        embeds: [errorEmbed('Ticket system not found.')],
        ephemeral: true,
      });
    }

    ticketConfig.panelDescription = panelDescription;
    await ticketConfig.save();

    const menuData = await showSetupMenu(interaction);
    return interaction.update({
      ...menuData,
      embeds: [successEmbed('Panel Description Updated', `Description set to: **${panelDescription}**`)],
    });
  } catch (error) {
    console.error('Error updating panel description:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handleButtonColorSelect(interaction) {
  const color = interaction.values[0];

  try {
    const ticketConfig = await TicketConfig.findOne({ guildId: interaction.guildId });

    if (!ticketConfig) {
      return interaction.reply({
        embeds: [errorEmbed('Ticket system not found.')],
        ephemeral: true,
      });
    }

    ticketConfig.buttonColor = color;
    await ticketConfig.save();

    const menuData = await showSetupMenu(interaction);
    return interaction.update({
      ...menuData,
      embeds: [successEmbed('Button Color Updated', `Buttons will now be: **${color}**`)],
    });
  } catch (error) {
    console.error('Error updating button color:', error);
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
      const menuData = await showSetupMenu(interaction);
      return interaction.reply({
        ...menuData,
        embeds: [errorEmbed(`"${ticketTypeName}" already exists.`)],
      });
    }

    // Store pending type and ask for button color first
    const tempId = Date.now().toString();
    pendingTicketTypes.set(tempId, { label: ticketTypeName, guildId: interaction.guildId });

    const colorMenu = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`ticketsupport_type_button_color_${tempId}`)
          .setPlaceholder('Choose a button color...')
          .addOptions(
            { label: '🔵 Primary (Blue)', value: 'Primary' },
            { label: '⚪ Secondary (Gray)', value: 'Secondary' },
            { label: '🟢 Success (Green)', value: 'Success' },
            { label: '🔴 Danger (Red)', value: 'Danger' }
          )
      );

    return interaction.reply({
      content: `Choose a color for the **${ticketTypeName}** button:`,
      components: [colorMenu],
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

export async function handleTicketTypeButtonColor(interaction) {
  const customIdParts = interaction.customId.split('_');
  const tempId = customIdParts[customIdParts.length - 1];
  const color = interaction.values[0];

  try {
    const pending = pendingTicketTypes.get(tempId);

    if (!pending) {
      return interaction.reply({
        embeds: [errorEmbed('Session expired. Please try again.')],
        ephemeral: true,
      });
    }

    // Store color in pending and save to config
    pending.buttonColor = color;

    const ticketConfig = await TicketConfig.findOne({ guildId: pending.guildId });
    if (ticketConfig) {
      ticketConfig.buttonColor = color;
      await ticketConfig.save();
    }

    // Now ask for roles
    const roleSelect = new RoleSelectMenuBuilder()
      .setCustomId(`ticketsupport_type_roles_${tempId}`)
      .setPlaceholder('Select roles that can view this ticket type...')
      .setMinValues(0)
      .setMaxValues(25);

    const botStaffButton = new ButtonBuilder()
      .setCustomId(`ticketsupport_add_botstaff_${tempId}`)
      .setLabel('✓ Include Bot Staff')
      .setStyle(ButtonStyle.Success);

    const doneButton = new ButtonBuilder()
      .setCustomId(`ticketsupport_roles_done_${tempId}`)
      .setLabel('Done')
      .setStyle(ButtonStyle.Primary);

    const rolesRow = new ActionRowBuilder().addComponents(roleSelect);
    const buttonsRow = new ActionRowBuilder().addComponents(botStaffButton, doneButton);

    return interaction.update({
      content: `Select which roles can view **${pending.label}** tickets (optional):\n\nClick "✓ Include Bot Staff" to add all bot staff members to this ticket type.`,
      components: [rolesRow, buttonsRow],
    });
  } catch (error) {
    console.error('Error handling ticket type button color:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handleAddBotStaffButton(interaction) {
  const customIdParts = interaction.customId.split('_');
  const tempId = customIdParts[customIdParts.length - 1];

  try {
    const pending = pendingTicketTypes.get(tempId);

    if (!pending) {
      return interaction.reply({
        embeds: [errorEmbed('Session expired. Please try again.')],
        ephemeral: true,
      });
    }

    if (!pending.includeStaff) {
      pending.includeStaff = true;
      return interaction.reply({
        content: '✅ Bot staff will be added to this ticket type. Now click "Done" when ready.',
        ephemeral: true,
      });
    } else {
      pending.includeStaff = false;
      return interaction.reply({
        content: '❌ Bot staff removal cancelled. Now click "Done" when ready.',
        ephemeral: true,
      });
    }
  } catch (error) {
    console.error('Error handling bot staff button:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handleRolesDoneButton(interaction) {
  const customIdParts = interaction.customId.split('_');
  const tempId = customIdParts[customIdParts.length - 1];

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
      allowedRoleIds: pending.selectedRoleIds || [],
      includeStaff: pending.includeStaff || false,
      createdAt: new Date(),
    });

    await ticketConfig.save();
    pendingTicketTypes.delete(tempId);

    const menuData = await showSetupMenu(interaction);
    const staffNote = pending.includeStaff ? ' + Bot Staff' : '';
    return interaction.update({
      ...menuData,
      embeds: [successEmbed('Ticket Type Added', `"${pending.label}" has been added with ${pending.selectedRoleIds?.length || 0} role(s)${staffNote}.`)],
    });
  } catch (error) {
    console.error('Error in roles done button:', error);
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

    pending.selectedRoleIds = selectedRoleIds;

    return interaction.reply({
      content: `✅ ${selectedRoleIds.length} role(s) selected. Click "Done" to finish.`,
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
      const menuData = await showSetupMenu(interaction);
      return interaction.reply({
        ...menuData,
        embeds: [errorEmbed('Invalid channel selected.')],
      });
    }

    // Update config
    ticketConfig.panelChannelId = channelId;
    await ticketConfig.save();

    const menuData = await showSetupMenu(interaction);
    return interaction.update({
      ...menuData,
      embeds: [successEmbed('Channel Selected', `Panel will be sent to <#${channelId}>`)],
    });
  } catch (error) {
    console.error('Error selecting ticket panel channel:', error);
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
      const menuData = await showSetupMenu(interaction);
      return interaction.update({
        ...menuData,
        embeds: [errorEmbed('Ticket panel channel not found.')],
      });
    }

    // Create the panel embed with custom title and description
    const panelEmbed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle(ticketConfig.panelTitle || 'Support Tickets')
      .setDescription(ticketConfig.panelDescription || 'Select a button below to create a support ticket.')
      .setFooter({ text: 'EverLink' })
      .setTimestamp();

    // Create buttons for each ticket type with custom color
    const buttonStyle = getButtonStyle(ticketConfig.buttonColor);
    const buttons = ticketConfig.ticketTypes.map(type =>
      new ButtonBuilder()
        .setCustomId(`ticket_create_${type.id}`)
        .setLabel(type.label)
        .setStyle(buttonStyle)
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

    // Reset only the channel selection for next panel (keep ticket types active)
    ticketConfig.panelChannelId = null;
    await ticketConfig.save();

    const menuData = await showSetupMenu(interaction);
    return interaction.update({
      ...menuData,
      embeds: [successEmbed('Panel Sent & Ready', `✅ Panel sent successfully!\n\n📝 Channel reset - you can now select another channel and send a new panel with different ticket types!`)],
    });
  } catch (error) {
    console.error('Error sending ticket panel:', error);
    const menuData = await showSetupMenu(interaction);
    return interaction.update({
      ...menuData,
      embeds: [errorEmbed('An error occurred while sending the panel.')],
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

    // Store pending ticket creation and show description modal
    const tempId = Date.now().toString();
    pendingTicketCreations.set(tempId, { ticketType, guildId: interaction.guildId, userId: interaction.user.id });

    const modal = new ModalBuilder()
      .setCustomId(`ticketsupport_create_ticket_${tempId}`)
      .setTitle(`Create ${ticketType.label} Ticket`)
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('ticket_description')
            .setLabel('Description')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Describe your issue...')
            .setMinLength(10)
            .setMaxLength(1000)
            .setRequired(true)
        )
      );

    return interaction.showModal(modal);
  } catch (error) {
    console.error('Error handling ticket button:', error);
    await interaction.reply({
      content: '❌ An error occurred while creating the ticket.',
      flags: 64,
    });
  }
}

export async function handleTicketCreationModal(interaction) {
  const customIdParts = interaction.customId.split('_');
  const tempId = customIdParts[customIdParts.length - 1];
  const description = interaction.fields.getTextInputValue('ticket_description');

  try {
    const pending = pendingTicketCreations.get(tempId);

    if (!pending) {
      return interaction.reply({
        content: '❌ Session expired. Please try again.',
        flags: 64,
      });
    }

    const guild = interaction.guild;
    const user = interaction.user;
    const ticketType = pending.ticketType;

    // Generate unique ticket ID
    const ticketCount = await Ticket.countDocuments({ guildId: interaction.guildId });
    const ticketId = `${ticketType.label.toLowerCase().replace(/\s+/g, '-')}-${ticketCount + 1}`;

    // Prepare permission overwrites
    const permissionOverwrites = [
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
    ];

    // If includeStaff is true, get all bot staff and add them
    if (ticketType.includeStaff) {
      const staffMembers = await Staff.find({ guildId: interaction.guildId });

      for (const staffMember of staffMembers) {
        if (staffMember.type === 'user' && staffMember.userId) {
          // Check if user permission already exists
          if (!permissionOverwrites.some(p => p.id === staffMember.userId)) {
            permissionOverwrites.push({
              id: staffMember.userId,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
            });
          }
        } else if (staffMember.type === 'role' && staffMember.roleId) {
          // Check if role permission already exists
          if (!permissionOverwrites.some(p => p.id === staffMember.roleId)) {
            permissionOverwrites.push({
              id: staffMember.roleId,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
            });
          }
        }
      }
    }

    // Create ticket channel
    const channel = await guild.channels.create({
      name: ticketId,
      type: ChannelType.GuildText,
      permissionOverwrites,
    });

    // Save ticket to database
    await Ticket.create({
      guildId: interaction.guildId,
      ticketId,
      userId: user.id,
      channelId: channel.id,
      ticketType: ticketType.label,
      description,
    });

    // Send welcome message in ticket channel
    const welcomeEmbed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle(`${ticketType.label} Ticket`)
      .addFields(
        { name: 'Ticket ID', value: ticketId, inline: true },
        { name: 'Type', value: ticketType.label, inline: true },
        { name: 'Description', value: description, inline: false }
      )
      .setFooter({ text: 'EverLink' })
      .setTimestamp();

    await channel.send({
      content: `${user}`,
      embeds: [welcomeEmbed],
    });

    pendingTicketCreations.delete(tempId);

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

export { pendingTicketTypes, pendingTicketCreations };
