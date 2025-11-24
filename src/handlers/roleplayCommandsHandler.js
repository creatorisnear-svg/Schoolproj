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
        embeds: [successEmbed('CAD Enabled', 'GTA5 CAD system has been enabled. Members can now use `/cad` to check dispatch info.')],
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
