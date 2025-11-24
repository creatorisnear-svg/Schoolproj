import RoleplayCommands from '../models/RoleplayCommands.js';
import { EmbedBuilder, ActionRowBuilder, ChannelSelectMenuBuilder, ChannelType, StringSelectMenuBuilder } from 'discord.js';
import { successEmbed, errorEmbed, infoEmbed } from '../utils/embedBuilder.js';

// Helper to show main menu
async function showSetupMenu(interaction) {
  const menu = new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('roleplaycommands_setup_menu')
        .setPlaceholder('Choose a command to configure...')
        .addOptions(
          { label: '911 - Emergency Reporting', value: 'setup_911' },
          { label: 'Twitter - Public Messages', value: 'setup_twitter' },
          { label: 'Anon - Anonymous Messages', value: 'setup_anon' },
          { label: 'CAD - Computer Aided Dispatch', value: 'setup_cad' },
          { label: '✅ Done - Close Setup', value: 'setup_done' }
        )
    );

  return {
    content: '**Roleplay Commands Setup**\n\nSelect a command to configure:',
    components: [menu],
    ephemeral: true,
  };
}

export async function handleRoleplayCommandsSelect(interaction) {
  const choice = interaction.values[0];

  try {
    const roleplayConfig = await RoleplayCommands.findOne({ guildId: interaction.guildId });

    if (!roleplayConfig) {
      return interaction.reply({
        embeds: [errorEmbed('Roleplay commands not found.')],
        ephemeral: true,
      });
    }

    if (choice === 'cmd_911') {
      // Show 911 form
      const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');

      const modal = new ModalBuilder()
        .setCustomId('911report')
        .setTitle('911 Report Form');

      const issueInput = new TextInputBuilder()
        .setCustomId('issue')
        .setLabel('Issue')
        .setPlaceholder('What happened? (e.g., Armed Robbery, Car Accident)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const locationInput = new TextInputBuilder()
        .setCustomId('location')
        .setLabel('Location')
        .setPlaceholder('Where did this happen? (e.g., Legion Square)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const suspectsDescInput = new TextInputBuilder()
        .setCustomId('suspectsDescription')
        .setLabel('Suspects & Vehicle Information')
        .setPlaceholder('Include: # of suspects, names, physical description, vehicle make/model/color, etc.')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false);

      const lastSeenInput = new TextInputBuilder()
        .setCustomId('lastSeen')
        .setLabel('Last Seen')
        .setPlaceholder('Last known location or direction of travel...')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      const contactInput = new TextInputBuilder()
        .setCustomId('contact')
        .setLabel('How can we contact you if needed?')
        .setPlaceholder('Discord tag, in-game name, phone number, etc.')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      const row1 = new ActionRowBuilder().addComponents(issueInput);
      const row2 = new ActionRowBuilder().addComponents(locationInput);
      const row3 = new ActionRowBuilder().addComponents(suspectsDescInput);
      const row4 = new ActionRowBuilder().addComponents(lastSeenInput);
      const row5 = new ActionRowBuilder().addComponents(contactInput);

      modal.addComponents(row1, row2, row3, row4, row5);

      return interaction.showModal(modal);
    }

    if (choice === 'cmd_twitter') {
      const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');

      const modal = new ModalBuilder()
        .setCustomId('twitter_post_modal')
        .setTitle('Post to Twitter')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('twitter_message')
              .setLabel('Message')
              .setStyle(TextInputStyle.Paragraph)
              .setPlaceholder('What do you want to post?')
              .setMinLength(1)
              .setMaxLength(2000)
              .setRequired(true)
          )
        );

      return interaction.showModal(modal);
    }

    if (choice === 'cmd_anon') {
      const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');

      const modal = new ModalBuilder()
        .setCustomId('anon_post_modal')
        .setTitle('Post Anonymously')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('anon_message')
              .setLabel('Message')
              .setStyle(TextInputStyle.Paragraph)
              .setPlaceholder('What do you want to post anonymously?')
              .setMinLength(1)
              .setMaxLength(2000)
              .setRequired(true)
          )
        );

      return interaction.showModal(modal);
    }

    if (choice === 'cmd_cad') {
      const cadEmbed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('GTA5 RP - CAD System')
        .setDescription('Computer Aided Dispatch - Law Enforcement Operations')
        .addFields(
          { name: '📍 Active Units', value: 'No active units at this time', inline: false },
          { name: '🚨 Dispatch Calls', value: 'No active calls', inline: false },
          { name: '📋 Recent Activity', value: 'System online and monitoring', inline: false }
        )
        .setFooter({ text: 'EverLink' })
        .setTimestamp();

      return interaction.reply({
        embeds: [cadEmbed],
        ephemeral: false,
      });
    }
  } catch (error) {
    console.error('Error handling roleplay commands select:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handleRoleplayCommandsSetupMenu(interaction) {
  const choice = interaction.values[0];

  try {
    const roleplayConfig = await RoleplayCommands.findOne({ guildId: interaction.guildId });

    if (!roleplayConfig) {
      return interaction.reply({
        embeds: [errorEmbed('Roleplay commands not found.')],
        ephemeral: true,
      });
    }

    if (choice === 'setup_911') {
      const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('roleplaycommands_911_channel')
        .setPlaceholder('Select the 911 reporting channel...')
        .addChannelTypes(ChannelType.GuildText);

      const row = new ActionRowBuilder().addComponents(channelSelect);

      return interaction.reply({
        content: 'Select the channel where 911 reports will be sent:',
        components: [row],
        ephemeral: true,
      });
    }

    if (choice === 'setup_twitter') {
      const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('roleplaycommands_twitter_channel')
        .setPlaceholder('Select the Twitter channel...')
        .addChannelTypes(ChannelType.GuildText);

      const row = new ActionRowBuilder().addComponents(channelSelect);

      return interaction.reply({
        content: 'Select the channel for Twitter posts:',
        components: [row],
        ephemeral: true,
      });
    }

    if (choice === 'setup_anon') {
      const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('roleplaycommands_anon_channel')
        .setPlaceholder('Select the anonymous/black market channel...')
        .addChannelTypes(ChannelType.GuildText);

      const row = new ActionRowBuilder().addComponents(channelSelect);

      return interaction.reply({
        content: 'Select the channel for anonymous messages:',
        components: [row],
        ephemeral: true,
      });
    }

    if (choice === 'setup_cad') {
      roleplayConfig.useCAD = true;
      await roleplayConfig.save();

      const menuData = await showSetupMenu(interaction);
      return interaction.update({
        ...menuData,
        embeds: [successEmbed('CAD Enabled', 'GTA5 CAD system has been enabled. Members can now access CAD through `/roleplaycommands` menu and manage characters with `/cadcharacter` and search plates with `/cadlicensesearch` (LEO only).')],
      });
    }

    if (choice === 'setup_done') {
      return interaction.reply({
        embeds: [successEmbed('Setup Complete', 'Your roleplay commands are ready to use!')],
        ephemeral: true,
      });
    }
  } catch (error) {
    console.error('Error in roleplay commands setup menu:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handleRoleplayCommand911Channel(interaction) {
  const channelId = interaction.values[0];

  try {
    const roleplayConfig = await RoleplayCommands.findOne({ guildId: interaction.guildId });

    if (!roleplayConfig) {
      return interaction.reply({
        embeds: [errorEmbed('Roleplay commands not found.')],
        ephemeral: true,
      });
    }

    roleplayConfig.use911 = true;
    roleplayConfig.use911Channel = channelId;
    await roleplayConfig.save();

    const menuData = await showSetupMenu(interaction);
    return interaction.update({
      ...menuData,
      embeds: [successEmbed('911 Channel Set', `911 reports will be sent to <#${channelId}>`)],
    });
  } catch (error) {
    console.error('Error setting 911 channel:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handleRoleplayCommandTwitterChannel(interaction) {
  const channelId = interaction.values[0];

  try {
    const roleplayConfig = await RoleplayCommands.findOne({ guildId: interaction.guildId });

    if (!roleplayConfig) {
      return interaction.reply({
        embeds: [errorEmbed('Roleplay commands not found.')],
        ephemeral: true,
      });
    }

    roleplayConfig.useTwitter = true;
    roleplayConfig.twitterChannel = channelId;
    await roleplayConfig.save();

    const menuData = await showSetupMenu(interaction);
    return interaction.update({
      ...menuData,
      embeds: [successEmbed('Twitter Channel Set', `Twitter posts will be sent to <#${channelId}>`)],
    });
  } catch (error) {
    console.error('Error setting Twitter channel:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handleRoleplayCommandAnonChannel(interaction) {
  const channelId = interaction.values[0];

  try {
    const roleplayConfig = await RoleplayCommands.findOne({ guildId: interaction.guildId });

    if (!roleplayConfig) {
      return interaction.reply({
        embeds: [errorEmbed('Roleplay commands not found.')],
        ephemeral: true,
      });
    }

    roleplayConfig.useAnon = true;
    roleplayConfig.anonChannel = channelId;
    await roleplayConfig.save();

    const menuData = await showSetupMenu(interaction);
    return interaction.update({
      ...menuData,
      embeds: [successEmbed('Anon Channel Set', `Anonymous messages will be sent to <#${channelId}>`)],
    });
  } catch (error) {
    console.error('Error setting anon channel:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handleTwitterPostModal(interaction) {
  const message = interaction.fields.getTextInputValue('twitter_message');

  try {
    const roleplayConfig = await RoleplayCommands.findOne({ guildId: interaction.guildId });

    if (!roleplayConfig || !roleplayConfig.twitterChannel) {
      return interaction.reply({
        embeds: [errorEmbed('Twitter channel not configured.')],
        ephemeral: true,
      });
    }

    const channel = await interaction.guild.channels.fetch(roleplayConfig.twitterChannel).catch(() => null);

    if (!channel) {
      return interaction.reply({
        embeds: [errorEmbed('Twitter channel not found.')],
        ephemeral: true,
      });
    }

    const twitterEmbed = new EmbedBuilder()
      .setColor('#1DA1F2')
      .setTitle('Twitter Post')
      .setDescription(message)
      .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
      .setFooter({ text: 'EverLink' })
      .setTimestamp();

    await channel.send({ embeds: [twitterEmbed] });

    return interaction.reply({
      content: '✅ Tweet posted!',
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error handling twitter post:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while posting.')],
      ephemeral: true,
    });
  }
}

export async function handleAnonPostModal(interaction) {
  const message = interaction.fields.getTextInputValue('anon_message');

  try {
    const roleplayConfig = await RoleplayCommands.findOne({ guildId: interaction.guildId });

    if (!roleplayConfig || !roleplayConfig.anonChannel) {
      return interaction.reply({
        embeds: [errorEmbed('Anonymous channel not configured.')],
        ephemeral: true,
      });
    }

    const channel = await interaction.guild.channels.fetch(roleplayConfig.anonChannel).catch(() => null);

    if (!channel) {
      return interaction.reply({
        embeds: [errorEmbed('Anonymous channel not found.')],
        ephemeral: true,
      });
    }

    const anonEmbed = new EmbedBuilder()
      .setColor('#808080')
      .setTitle('Anonymous Message')
      .setDescription(message)
      .setFooter({ text: 'EverLink' })
      .setTimestamp();

    await channel.send({ embeds: [anonEmbed] });

    return interaction.reply({
      content: '✅ Anonymous message posted!',
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error handling anon post:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while posting.')],
      ephemeral: true,
    });
  }
}

export async function handle911ReportModal(interaction) {
  try {
    const issue = interaction.fields.getTextInputValue('issue');
    const location = interaction.fields.getTextInputValue('location');
    const suspectsDesc = interaction.fields.getTextInputValue('suspectsDescription') || 'N/A';
    const lastSeen = interaction.fields.getTextInputValue('lastSeen') || 'Unknown';
    const contact = interaction.fields.getTextInputValue('contact') || 'No contact info provided';

    const roleplayConfig = await RoleplayCommands.findOne({ guildId: interaction.guildId });

    if (!roleplayConfig || !roleplayConfig.use911Channel) {
      return interaction.reply({
        embeds: [errorEmbed('911 channel not configured.')],
        ephemeral: true,
      });
    }

    const channel = await interaction.guild.channels.fetch(roleplayConfig.use911Channel).catch(() => null);

    if (!channel) {
      return interaction.reply({
        embeds: [errorEmbed('911 channel not found.')],
        ephemeral: true,
      });
    }

    const emergencyEmbed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('🚨 911 Emergency Report')
      .addFields(
        { name: 'Issue', value: issue, inline: false },
        { name: 'Location', value: location, inline: true },
        { name: 'Reporter', value: interaction.user.username, inline: true },
        { name: 'Suspects & Vehicle', value: suspectsDesc, inline: false },
        { name: 'Last Seen', value: lastSeen, inline: false },
        { name: 'Contact Info', value: contact, inline: false }
      )
      .setFooter({ text: 'EverLink' })
      .setTimestamp();

    await channel.send({ embeds: [emergencyEmbed] });

    return interaction.reply({
      content: '✅ 911 report submitted!',
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error handling 911 report:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while submitting the report.')],
      ephemeral: true,
    });
  }
}
