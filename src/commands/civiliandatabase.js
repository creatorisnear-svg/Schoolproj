import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import RoleplayCommands from '../models/RoleplayCommands.js';
import { errorEmbed } from '../utils/embedBuilder.js';

export const data = new SlashCommandBuilder()
  .setName('civiliandatabase')
  .setDescription('Civilian Database - manage characters, report emergencies, and more');

export async function execute(interaction) {
  try {
    const roleplayConfig = await RoleplayCommands.findOne({ guildId: interaction.guildId });

    if (!roleplayConfig || !roleplayConfig.enabled) {
      return interaction.reply({
        embeds: [errorEmbed('System Unavailable', 'Roleplay commands are not enabled on this server. Contact an administrator to get started.')],
        flags: 64,
      });
    }

    const menu = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('civiliandatabase_menu')
          .setPlaceholder('Select an option...')
          .addOptions(
            { label: 'Report 911 Emergency', value: 'report_911', description: 'Submit an emergency report to active officers' },
            { label: 'Post to Twitter', value: 'post_twitter', description: 'Post a message to the RP social feed' },
            { label: 'Post Anonymously', value: 'post_anon', description: 'Send a message to the anonymous channel' },
            { label: 'Create Character', value: 'create_character', description: 'Register a new civilian character' },
            { label: 'Add Vehicle', value: 'add_vehicle', description: 'Register a vehicle to one of your characters' },
            { label: 'Add Firearm', value: 'add_firearm', description: 'Register a licensed weapon to a character' },
            { label: 'Manage Character', value: 'manage_character', description: 'View, edit, or delete your characters' },
            { label: 'View & Pay Fines', value: 'view_fines', description: 'See outstanding traffic tickets and pay them' }
          )
      );

    const embed = new EmbedBuilder()
      .setColor(0x2B2D31)
      .setTitle('Civilian Database')
      .setDescription(
        'Select an option from the menu below.\n\n' +
        '**Getting started?**\n' +
        '> Start with **Create Character** to register your civilian identity, then use **Add Vehicle** or **Add Firearm** to register your property.\n\n' +
        '**Need help?**\n' +
        '> Use **Report 911** to alert on-duty officers, or **View Fines** to check and pay any outstanding tickets.\n\n' +
        '**Prefer a browser?**\n' +
        '> Everything here is on the web CAD too, which is easier on a phone.'
      )
      .setFooter({ text: 'RPM  •  Only visible to you' });

    // The same records are in a browser, which is easier on a phone than
    // working through a select menu. The button for that is added to every
    // screen like this one by the wrapper in utils/replyLinks.js, so the hand
    // rolled row that used to sit here would only have duplicated it.
    return interaction.reply({
      embeds: [embed],
      components: [menu],
      flags: 64,
    });
  } catch (error) {
    console.error('Error executing civiliandatabase:', error);
    return interaction.reply({
      embeds: [errorEmbed('Unexpected Error', 'Something went wrong. Please try again. If the issue persists, contact a server administrator.')],
      flags: 64,
    });
  }
}
