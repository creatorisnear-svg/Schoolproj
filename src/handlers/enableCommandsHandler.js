import { EmbedBuilder } from 'discord.js';
import Config from '../models/Config.js';
import RoleplayCommands from '../models/RoleplayCommands.js';
import Priority from '../models/Priority.js';
import { StrikeConfig } from '../models/Strike.js';
import RoleplayCalendar from '../models/RoleplayCalendar.js';
import TicketConfig from '../models/TicketConfig.js';

export async function handleEnableCommandButton(interaction) {
  try {
    const customId = interaction.customId;
    const guildId = interaction.guildId;
    
    let featureName = '';
    let model = null;
    let field = 'enabled';
    let setupCommand = '';

    if (customId === 'enable_roleplay') {
      featureName = '🎮 Roleplay Commands';
      model = RoleplayCommands;
      setupCommand = 'Run `/roleplaycommandsetup` to configure.';
    } else if (customId === 'enable_priority') {
      featureName = '⭐ Priority Tracker';
      model = Priority;
      setupCommand = 'Run `/prioritytrackersetup` to configure.';
    } else if (customId === 'enable_strike') {
      featureName = '🚨 Strike System';
      model = StrikeConfig;
      setupCommand = 'Run `/strikesystemsetup` to configure.';
    } else if (customId === 'enable_calendar') {
      featureName = '📅 Roleplay Calendar';
      model = RoleplayCalendar;
      setupCommand = 'Run `/roleplaycalendersetup` to configure.';
    } else if (customId === 'enable_ticket') {
      featureName = '🎫 Ticket Support';
      model = TicketConfig;
      setupCommand = 'Run `/ticketsupportsetup` to configure.';
    }

    // Save to database
    if (model) {
      let doc = await model.findOne({ guildId }) || new model({ guildId });
      doc[field] = true;
      await doc.save();
    }

    const embed = createSuccessEmbed(`${featureName} Enabled`, `${featureName} has been enabled. ${setupCommand}`);
    return interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error in enable button handler:', error);
    return interaction.reply({
      embeds: [createErrorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handleDisableCommandButton(interaction) {
  try {
    const customId = interaction.customId;
    const guildId = interaction.guildId;

    let featureName = '';
    let model = null;
    let field = 'enabled';

    if (customId === 'disable_roleplay') {
      featureName = '🎮 Roleplay Commands';
      model = RoleplayCommands;
    } else if (customId === 'disable_priority') {
      featureName = '⭐ Priority Tracker';
      model = Priority;
    } else if (customId === 'disable_strike') {
      featureName = '🚨 Strike System';
      model = StrikeConfig;
    } else if (customId === 'disable_calendar') {
      featureName = '📅 Roleplay Calendar';
      model = RoleplayCalendar;
    } else if (customId === 'disable_ticket') {
      featureName = '🎫 Ticket Support';
      model = TicketConfig;
    }

    // Save to database
    if (model) {
      let doc = await model.findOne({ guildId });
      if (doc) {
        doc[field] = false;
        await doc.save();
      }
    }

    const embed = createSuccessEmbed(`${featureName} Disabled`, `${featureName} has been disabled.`);
    return interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error in disable button handler:', error);
    return interaction.reply({
      embeds: [createErrorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

export async function handleAntiPromoteButton(interaction) {
  try {
    const customId = interaction.customId;
    const guildId = interaction.guildId;
    const isEnable = customId === 'enable_antipromote';

    let config = await Config.findOne({ guildId }) || new Config({ guildId });
    config.antiPromotingEnabled = isEnable;
    await config.save();

    const status = isEnable ? 'Enabled' : 'Disabled';
    const message = isEnable 
      ? 'Anti-promoting system has been enabled. Invite links will be monitored and logged to the configured log channel.'
      : 'Anti-promoting system has been disabled.';

    const embed = createSuccessEmbed(`⛔ Anti-Promoting ${status}`, message);
    return interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  } catch (error) {
    console.error('Error in anti-promote button handler:', error);
    return interaction.reply({
      embeds: [createErrorEmbed('An error occurred.')],
      ephemeral: true,
    });
  }
}

function createSuccessEmbed(title, description) {
  return new EmbedBuilder()
    .setColor('#00AA00')
    .setTitle(`✅ ${title}`)
    .setDescription(description)
    .setFooter({ text: 'EverLink' });
}

function createErrorEmbed(description) {
  return new EmbedBuilder()
    .setColor('#FF0000')
    .setTitle('❌ Error')
    .setDescription(description)
    .setFooter({ text: 'EverLink' });
}
