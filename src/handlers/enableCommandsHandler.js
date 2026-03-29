import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import Config from '../models/Config.js';
import RoleplayCommands from '../models/RoleplayCommands.js';
import Priority from '../models/Priority.js';
import { StrikeConfig } from '../models/Strike.js';
import RoleplayCalendar from '../models/RoleplayCalendar.js';
import TicketConfig from '../models/TicketConfig.js';
import RoleRequestConfig from '../models/RoleRequestConfig.js';
import Verification from '../models/Verification.js';
import Welcome from '../models/Welcome.js';
import { revertVerificationPermissions } from './selectMenuHandler.js';
import { isAdmin, isAdminOrManager, checkStaffPermission } from '../utils/permissions.js';

export async function handleEnableChoiceButton(interaction) {
  try {
    const isAdminOrMgr = await isAdminOrManager(interaction);
    const isStaffUser = await checkStaffPermission(interaction);

    if (!isAdminOrMgr && !isStaffUser) {
      const embed = new EmbedBuilder()
        .setColor('#2d2d2d')
        .setTitle('Permission Denied')
        .setDescription('You do not have permission to use this command. This is an admin/staff-only command.')
        .setFooter({ text: 'RPM' });
      
      return interaction.reply({
        embeds: [embed],
        flags: 64,
      });
    }

    const customId = interaction.customId;

    if (customId === 'choice_done') {
      // User clicked Done - close the menu
      await interaction.deferUpdate();
      return;
    }

    const isEnable = customId === 'choice_enable';

    if (isEnable) {
      // Show enable options
      const embed = new EmbedBuilder()
        .setColor('#2d2d2d')
        .setTitle('Enable Features')
        .setDescription('Select which features you want to enable:')
        .setFooter({ text: 'RPM' });

      const enableRow1 = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('enable_roleplay')
            .setLabel('Roleplay Commands')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('enable_priority')
            .setLabel('Priority Tracker')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('enable_strike')
            .setLabel('Strike System')
            .setStyle(ButtonStyle.Success)
        );

      const enableRow2 = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('enable_calendar')
            .setLabel('Roleplay Calendar')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('enable_ticket')
            .setLabel('Ticket Support')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('enable_antipromote')
            .setLabel('Anti-Promoting')
            .setStyle(ButtonStyle.Success)
        );

      const enableRow3 = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('enable_rolerequest')
            .setLabel('Role Request')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('enable_verification')
            .setLabel('Verification System')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('enable_welcome')
            .setLabel('Welcome System')
            .setStyle(ButtonStyle.Success)
        );

      return interaction.update({
        embeds: [embed],
        components: [enableRow1, enableRow2, enableRow3],
      });
    } else {
      // Show disable options
      const embed = new EmbedBuilder()
        .setColor('#2d2d2d')
        .setTitle('Disable Features')
        .setDescription('Select which features you want to disable:')
        .setFooter({ text: 'RPM' });

      const disableRow1 = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('disable_roleplay')
            .setLabel('Roleplay Commands')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('disable_priority')
            .setLabel('Priority Tracker')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('disable_strike')
            .setLabel('Strike System')
            .setStyle(ButtonStyle.Danger)
        );

      const disableRow2 = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('disable_calendar')
            .setLabel('Roleplay Calendar')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('disable_ticket')
            .setLabel('Ticket Support')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('disable_antipromote')
            .setLabel('Anti-Promoting')
            .setStyle(ButtonStyle.Danger)
        );

      const disableRow3 = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('disable_rolerequest')
            .setLabel('Role Request')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('disable_verification')
            .setLabel('Verification System')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('disable_welcome')
            .setLabel('Welcome System')
            .setStyle(ButtonStyle.Danger)
        );

      return interaction.update({
        embeds: [embed],
        components: [disableRow1, disableRow2, disableRow3],
      });
    }
  } catch (error) {
    console.error('Error in enable/disable choice handler:', error);
    try {
      return interaction.update({
        embeds: [createErrorEmbed('An error occurred.')],
      });
    } catch (updateError) {
      console.error('Failed to update after error:', updateError);
    }
  }
}

export async function handleEnableCommandButton(interaction) {
  try {
    const isAdminOrMgr = await isAdminOrManager(interaction);
    const isStaffUser = await checkStaffPermission(interaction);

    if (!isAdminOrMgr && !isStaffUser) {
      const embed = new EmbedBuilder()
        .setColor('#2d2d2d')
        .setTitle('Permission Denied')
        .setDescription('You do not have permission to use this command. This is an admin/staff-only command.')
        .setFooter({ text: 'RPM' });
      
      return interaction.reply({
        embeds: [embed],
        flags: 64,
      });
    }

    const customId = interaction.customId;
    const guildId = interaction.guildId;
    
    let featureName = '';
    let model = null;
    let field = 'enabled';
    let setupCommand = '';

    if (customId === 'enable_roleplay') {
      featureName = 'Roleplay Commands';
      model = RoleplayCommands;
      setupCommand = 'Run `/roleplaycommandsetup` to configure.';
    } else if (customId === 'enable_priority') {
      featureName = 'Priority Tracker';
      model = Priority;
      setupCommand = 'Run `/prioritytrackersetup` to configure.';
    } else if (customId === 'enable_strike') {
      featureName = 'Strike System';
      model = StrikeConfig;
      setupCommand = 'Run `/strikesystemsetup` to configure.';
    } else if (customId === 'enable_calendar') {
      featureName = 'Roleplay Calendar';
      model = RoleplayCalendar;
      setupCommand = 'Run `/roleplaycalendersetup` to configure.';
    } else if (customId === 'enable_ticket') {
      featureName = 'Ticket Support';
      model = TicketConfig;
      setupCommand = 'Run `/ticketsupportsetup` to configure.';
    } else if (customId === 'enable_antipromote') {
      featureName = 'Anti-Promoting';
      let config = await Config.findOne({ guildId }) || new Config({ guildId });
      config.antiPromotingEnabled = true;
      await config.save();
      const embed = createSuccessEmbed(`${featureName} Enabled`, `${featureName} has been enabled.`);
      return interaction.update({
        embeds: [embed],
      });
    } else if (customId === 'enable_rolerequest') {
      featureName = 'Role Request';
      model = RoleRequestConfig;
      setupCommand = 'Run `/rolerequestadd` to add role request types.';
    } else if (customId === 'enable_verification') {
      featureName = 'Verification System';
      model = Verification;
      setupCommand = 'Run `/verifysystemsetup` to configure.';
    } else if (customId === 'enable_welcome') {
      featureName = 'Welcome System';
      model = Welcome;
      setupCommand = 'Run `/welcomesystemsetup` to configure.';
    }

    // Save to database
    if (model) {
      let doc = await model.findOne({ guildId }) || new model({ guildId });
      doc[field] = true;
      await doc.save();
    }

    const embed = createSuccessEmbed(`${featureName} Enabled`, `${featureName} has been enabled. ${setupCommand}`);
    return interaction.update({
      embeds: [embed],
    });
  } catch (error) {
    console.error('Error in enable button handler:', error);
    try {
      return interaction.update({
        embeds: [createErrorEmbed('An error occurred.')],
      });
    } catch (updateError) {
      console.error('Failed to update after error:', updateError);
    }
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
      featureName = 'Roleplay Commands';
      model = RoleplayCommands;
    } else if (customId === 'disable_priority') {
      featureName = 'Priority Tracker';
      model = Priority;
    } else if (customId === 'disable_strike') {
      featureName = 'Strike System';
      model = StrikeConfig;
    } else if (customId === 'disable_calendar') {
      featureName = 'Roleplay Calendar';
      model = RoleplayCalendar;
    } else if (customId === 'disable_ticket') {
      featureName = 'Ticket Support';
      model = TicketConfig;
    } else if (customId === 'disable_antipromote') {
      featureName = 'Anti-Promoting';
      let config = await Config.findOne({ guildId });
      if (config) {
        config.antiPromotingEnabled = false;
        await config.save();
      }
      const embed = createSuccessEmbed(`${featureName} Disabled`, `${featureName} has been disabled.`);
      return interaction.update({
        embeds: [embed],
      });
    } else if (customId === 'disable_rolerequest') {
      featureName = 'Role Request';
      model = RoleRequestConfig;
    } else if (customId === 'disable_verification') {
      featureName = 'Verification System';
      model = Verification;
    } else if (customId === 'disable_welcome') {
      featureName = 'Welcome System';
      model = Welcome;
    }

    // Save to database
    if (model) {
      let doc = await model.findOne({ guildId });
      if (doc) {
        doc[field] = false;
        await doc.save();
      }
    }

    const embed = createSuccessEmbed(`${featureName} Disabled`, `${featureName} has been disabled.\n\nAll channel permissions have been reverted to default.`);
    await interaction.update({
      embeds: [embed],
    });

    // Revert verification permissions in background (non-blocking)
    if (customId === 'disable_verification') {
      const verification = await Verification.findOne({ guildId });
      if (verification) {
        revertVerificationPermissions(interaction.guild, verification).catch(error => {
          console.error('Error reverting verification permissions:', error);
        });
      }
    }
  } catch (error) {
    console.error('Error in disable button handler:', error);
    try {
      return interaction.update({
        embeds: [createErrorEmbed('An error occurred.')],
      });
    } catch (updateError) {
      console.error('Failed to update after error:', updateError);
    }
  }
}

function createSuccessEmbed(title, description) {
  return new EmbedBuilder()
    .setColor('#2d2d2d')
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: 'RPM' });
}

function createErrorEmbed(description) {
  return new EmbedBuilder()
    .setColor('#2d2d2d')
    .setTitle('Error')
    .setDescription(description)
    .setFooter({ text: 'RPM' });
}
