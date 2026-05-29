import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import RoleplayCommands from '../models/RoleplayCommands.js';
import CADCharacter from '../models/CADCharacter.js';
import TrafficTicket from '../models/TrafficTicket.js';
import EconomyBalance from '../models/EconomyBalance.js';
import EconomyConfig from '../models/EconomyConfig.js';
import { errorEmbed, successEmbed } from '../utils/embedBuilder.js';
import { capitalizeName } from '../utils/nameFormatter.js';

export async function handleCivilianDatabaseMenu(interaction) {
  const choice = interaction.values[0];

  try {
    // Verify roleplay commands are enabled
    const roleplayConfig = await RoleplayCommands.findOne({ guildId: interaction.guildId });
    if (!roleplayConfig || !roleplayConfig.enabled) {
      return interaction.reply({
        embeds: [errorEmbed('Roleplay commands are not enabled.')],
        flags: 64,
      });
    }

    if (choice === 'report_911') {
      if (!roleplayConfig.use911 || !roleplayConfig.use911Channel) {
        return interaction.reply({
          embeds: [errorEmbed('911 System Not Configured', 'This feature has not been set up by administrators. Please contact a server admin.')],
          flags: 64,
        });
      }

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

    if (choice === 'post_twitter') {
      if (!roleplayConfig.useTwitter || !roleplayConfig.twitterChannel) {
        return interaction.reply({
          embeds: [errorEmbed('Twitter System Not Configured', 'This feature has not been set up by administrators. Please contact a server admin.')],
          flags: 64,
        });
      }

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

    if (choice === 'post_anon') {
      if (!roleplayConfig.useAnon || !roleplayConfig.anonChannel) {
        return interaction.reply({
          embeds: [errorEmbed('Anonymous System Not Configured', 'This feature has not been set up by administrators. Please contact a server admin.')],
          flags: 64,
        });
      }

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

    if (choice === 'create_character') {
      const modal = new ModalBuilder()
        .setCustomId('cadcharacter_create_modal')
        .setTitle('Create Character - Step 1')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('character_name')
              .setLabel('Character Name')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('e.g., John Smith (Capitalize First & Last Name)')
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('character_age')
              .setLabel('Age')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('e.g., 28')
              .setRequired(false)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('character_gender')
              .setLabel('Gender')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('e.g., Male/Female')
              .setRequired(false)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('char_placeholder_1')
              .setLabel('Info')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('(Step 1 of 3)')
              .setRequired(false)
              .setMaxLength(1)
              .setValue(' ')
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('char_placeholder_2')
              .setLabel('Next Step')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('→ Click "Submit" below')
              .setRequired(false)
              .setMaxLength(1)
              .setValue(' ')
          )
        );

      return interaction.showModal(modal);
    }

    if (choice === 'add_vehicle') {
      const characters = await CADCharacter.find({ guildId: interaction.guildId, userId: interaction.user.id });

      if (characters.length === 0) {
        return interaction.reply({
          embeds: [errorEmbed('You need to create a character first.')],
          flags: 64,
        });
      }

      const charMenu = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('cadcharacter_select_for_vehicle')
            .setPlaceholder('Select a character...')
            .addOptions(characters.map(c => ({
              label: c.characterName,
              value: c._id.toString(),
            })))
        );

      const backButton = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('back_to_civilian_menu')
            .setLabel('← Back')
            .setStyle(ButtonStyle.Secondary)
        );

      return interaction.update({
        content: 'Select a character to add a vehicle to:',
        components: [charMenu, backButton],
      });
    }

    if (choice === 'add_firearm') {
      const characters = await CADCharacter.find({ guildId: interaction.guildId, userId: interaction.user.id });

      if (characters.length === 0) {
        return interaction.reply({
          embeds: [errorEmbed('You need to create a character first.')],
          flags: 64,
        });
      }

      const charMenu = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('cadcharacter_select_for_gun')
            .setPlaceholder('Select a character...')
            .addOptions(characters.map(c => ({
              label: c.characterName,
              value: c._id.toString(),
            })))
        );

      const backButton = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('back_to_civilian_menu')
            .setLabel('← Back')
            .setStyle(ButtonStyle.Secondary)
        );

      return interaction.update({
        content: 'Select a character to add a firearm to:',
        components: [charMenu, backButton],
      });
    }

    if (choice === 'manage_character') {
      const characters = await CADCharacter.find({ guildId: interaction.guildId, userId: interaction.user.id });

      if (characters.length === 0) {
        return interaction.reply({
          embeds: [errorEmbed('No Characters', 'You haven\'t created any characters yet.')],
          flags: 64,
        });
      }

      const charMenu = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('civilian_manage_character_select')
            .setPlaceholder('Select a character to manage...')
            .addOptions(characters.map(c => ({
              label: c.characterName,
              value: c._id.toString(),
              description: `Age: ${c.age || 'N/A'} | Vehicles: ${c.vehicles?.length || 0}`
            })))
        );

      const backButton = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('back_to_civilian_menu')
            .setLabel('← Back')
            .setStyle(ButtonStyle.Secondary)
        );

      return interaction.update({
        content: '**MANAGE CHARACTER**\n\nSelect a character to view, edit, or delete:',
        components: [charMenu, backButton],
      });
    }

    if (choice === 'view_fines') {
      const chars = await CADCharacter.find({ guildId: interaction.guildId, userId: interaction.user.id });

      if (chars.length === 0) {
        return interaction.reply({
          embeds: [errorEmbed('No Characters', 'You need to create a character before you can view fines.')],
          flags: 64,
        });
      }

      const charIds = chars.map(c => c._id);
      const tickets = await TrafficTicket.find({
        guildId: interaction.guildId,
        $or: [
          { characterId: { $in: charIds } },
          { characterName: { $in: chars.map(c => c.characterName) } },
        ],
      }).sort({ createdAt: -1 }).limit(20);

      const econConfig = await EconomyConfig.findOne({ guildId: interaction.guildId });
      const sym = econConfig?.currencySymbol || '$';

      const unpaid = tickets.filter(t => !t.paid);
      const paid = tickets.filter(t => t.paid);

      let description = '';
      if (tickets.length === 0) {
        description = 'No traffic fines on record.';
      } else {
        if (unpaid.length > 0) {
          const totalOwed = unpaid.reduce((s, t) => s + (t.fine || 0), 0);
          description += `**Total Owed:** ${sym}${totalOwed.toLocaleString()}\n\n`;
          description += `**Unpaid Fines**\n`;
          unpaid.slice(0, 10).forEach(t => {
            const charName = chars.find(c => c._id.toString() === t.characterId?.toString())?.characterName || t.characterName || 'Unknown';
            description += `\`#${t.ticketId}\` **${t.violation}** — ${sym}${(t.fine || 0).toLocaleString()} | ${charName}\n`;
            if (t.description) description += `-# ${t.description}\n`;
          });
        } else {
          description += '**No unpaid fines.**\n';
        }
        if (paid.length > 0) {
          description += `\n**Paid Fines (${paid.length})**\n`;
          paid.slice(0, 5).forEach(t => {
            description += `~~\`#${t.ticketId}\` **${t.violation}** — ${sym}${(t.fine || 0).toLocaleString()}~~\n`;
          });
        }
      }

      const embed = new EmbedBuilder()
        .setColor('#2d2d2d')
        .setTitle('Traffic Fines')
        .setDescription(description)
        .setFooter({ text: 'RPM' });

      const components = [];

      const payable = unpaid.slice(0, 20);
      for (let i = 0; i < payable.length; i += 5) {
        const row = new ActionRowBuilder();
        payable.slice(i, i + 5).forEach(t => {
          const label = `Pay #${t.ticketId} (${sym}${(t.fine || 0).toLocaleString()})`.slice(0, 80);
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`civilian_pay_fine_${t.ticketId}`)
              .setLabel(label)
              .setStyle(ButtonStyle.Primary)
          );
        });
        components.push(row);
        if (components.length >= 4) break;
      }

      components.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('back_to_civilian_menu')
            .setLabel('← Back')
            .setStyle(ButtonStyle.Secondary)
        )
      );

      return interaction.update({
        content: '',
        embeds: [embed],
        components,
      });
    }
  } catch (error) {
    console.error('Error in civilian database menu:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      flags: 64,
    });
  }
}

export async function handleCivilianManageCharacterSelect(interaction) {
  const characterId = interaction.values[0];

  try {
    const character = await CADCharacter.findOne({
      _id: characterId,
      guildId: interaction.guildId,
      userId: interaction.user.id
    });

    if (!character) {
      return interaction.reply({
        embeds: [errorEmbed('Character Not Found', 'This character could not be found.')],
        flags: 64,
      });
    }

    // Show character details with action buttons
    let description = `**Name:** ${character.characterName}\n`;
    if (character.age) description += `**Age:** ${character.age}\n`;
    if (character.gender) description += `**Gender:** ${character.gender}\n`;
    if (character.hairColor) description += `**Hair:** ${character.hairColor}\n`;
    if (character.eyeColor) description += `**Eyes:** ${character.eyeColor}\n`;
    if (character.socialSecurityNumber) description += `**SSN:** ${character.socialSecurityNumber}\n`;
    if (character.driversLicense) description += `**License:** ${character.driversLicense}\n`;
    
    description += `\n**Vehicles:** ${character.vehicles?.length || 0}\n`;
    description += `**Weapons:** ${character.guns?.length || 0}`;

    const embed = new EmbedBuilder()
      .setColor('#2d2d2d')
      .setTitle(`${character.characterName}`)
      .setDescription(description)
      .setFooter({ text: 'RPM' });

    const backButton = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('back_to_civilian_menu')
          .setLabel('← Back')
          .setStyle(ButtonStyle.Secondary)
      );

    const actionButtons = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`char_edit_${characterId}`)
          .setLabel('Edit')
          .setStyle('Primary'),
        new ButtonBuilder()
          .setCustomId(`char_delete_${characterId}`)
          .setLabel('Delete')
          .setStyle('Danger')
      );

    return interaction.update({
      embeds: [embed],
      components: [actionButtons, backButton],
    });
  } catch (error) {
    console.error('Error managing character:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      flags: 64,
    });
  }
}

export async function handleCharacterEdit(interaction, characterId) {
  try {
    const character = await CADCharacter.findOne({
      _id: characterId,
      guildId: interaction.guildId,
      userId: interaction.user.id
    });

    if (!character) {
      return interaction.reply({
        embeds: [errorEmbed('Character Not Found')],
        flags: 64,
      });
    }

    const modal = new ModalBuilder()
      .setCustomId(`char_edit_modal_${characterId}`)
      .setTitle(`Edit ${character.characterName}`)
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('edit_age')
            .setLabel('Age')
            .setValue(character.age?.toString() || '')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('edit_gender')
            .setLabel('Gender')
            .setValue(character.gender || '')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('edit_hair_color')
            .setLabel('Hair Color')
            .setValue(character.hairColor || '')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('edit_eye_color')
            .setLabel('Eye Color')
            .setValue(character.eyeColor || '')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('edit_ssn')
            .setLabel('SSN (optional)')
            .setValue(character.socialSecurityNumber || '')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
        )
      );

    return interaction.showModal(modal);
  } catch (error) {
    console.error('Error opening edit modal:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      flags: 64,
    });
  }
}

export async function handleCharacterEditModal(interaction, characterId) {
  const age = interaction.fields.getTextInputValue('edit_age');
  const gender = interaction.fields.getTextInputValue('edit_gender');
  const hairColor = interaction.fields.getTextInputValue('edit_hair_color');
  const eyeColor = interaction.fields.getTextInputValue('edit_eye_color');
  const ssn = interaction.fields.getTextInputValue('edit_ssn');

  try {
    const character = await CADCharacter.findOne({
      _id: characterId,
      guildId: interaction.guildId,
      userId: interaction.user.id
    });

    if (!character) {
      return interaction.reply({
        embeds: [errorEmbed('Character Not Found')],
        flags: 64,
      });
    }

    // Update fields
    if (age) character.age = parseInt(age);
    if (gender) character.gender = gender;
    if (hairColor) character.hairColor = hairColor;
    if (eyeColor) character.eyeColor = eyeColor;
    if (ssn) character.socialSecurityNumber = ssn;

    await character.save();

    let updatedDesc = `**Updated Fields:**\n`;
    if (age) updatedDesc += `• Age: ${age}\n`;
    if (gender) updatedDesc += `• Gender: ${gender}\n`;
    if (hairColor) updatedDesc += `• Hair: ${hairColor}\n`;
    if (eyeColor) updatedDesc += `• Eyes: ${eyeColor}\n`;
    if (ssn) updatedDesc += `• SSN: ${ssn}\n`;

    return interaction.reply({
      embeds: [successEmbed('Character Updated', `**${character.characterName}** has been updated!\n\n${updatedDesc}`)],
      flags: 64,
    });
  } catch (error) {
    console.error('Error updating character:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      flags: 64,
    });
  }
}

export async function handleCharacterDelete(interaction, characterId) {
  try {
    const character = await CADCharacter.findOne({
      _id: characterId,
      guildId: interaction.guildId,
      userId: interaction.user.id
    });

    if (!character) {
      return interaction.reply({
        embeds: [errorEmbed('Character Not Found')],
        flags: 64,
      });
    }

    // Show confirmation
    const confirmButtons = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`char_delete_confirm_${characterId}`)
          .setLabel('Yes, Delete')
          .setStyle('Danger'),
        new ButtonBuilder()
          .setCustomId('char_delete_cancel')
          .setLabel('Cancel')
          .setStyle('Secondary')
      );

    const { infoEmbed } = await import('../utils/embedBuilder.js');
    return interaction.reply({
      embeds: [infoEmbed('Confirm Delete', `Are you sure you want to delete **${character.characterName}**? This cannot be undone.`)],
      components: [confirmButtons],
      flags: 64,
    });
  } catch (error) {
    console.error('Error deleting character:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      flags: 64,
    });
  }
}

export async function handleCharacterDeleteConfirm(interaction, characterId) {
  try {
    const character = await CADCharacter.findOneAndDelete({
      _id: characterId,
      guildId: interaction.guildId,
      userId: interaction.user.id
    });

    if (!character) {
      return interaction.reply({
        embeds: [errorEmbed('Character Not Found')],
        flags: 64,
      });
    }

    // Show success and return to main menu
    const menu = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('civilian_database_menu')
          .setPlaceholder('Select an action...')
          .addOptions(
            { label: 'Report 911 Emergency', value: 'report_911' },
            { label: 'Post to Twitter', value: 'post_twitter' },
            { label: 'Post Anonymously', value: 'post_anon' },
            { label: 'Create Character', value: 'create_character' },
            { label: 'Add Vehicle', value: 'add_vehicle' },
            { label: 'Add Firearm', value: 'add_firearm' },
            { label: 'Manage Character', value: 'manage_character' }
          )
      );

    return interaction.reply({
      embeds: [successEmbed('Character Deleted', `**${character.characterName}** has been permanently deleted.`)],
      components: [menu],
      flags: 64,
    });
  } catch (error) {
    console.error('Error deleting character:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred.')],
      flags: 64,
    });
  }
}

export async function handleCivilianPayFine(interaction, ticketId) {
  try {
    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    const ticket = await TrafficTicket.findOne({ guildId, ticketId });
    if (!ticket) {
      return interaction.reply({
        embeds: [errorEmbed('Ticket Not Found', 'This traffic fine could not be found.')],
        flags: 64,
      });
    }
    if (ticket.paid) {
      return interaction.reply({
        embeds: [errorEmbed('Already Paid', 'This fine has already been paid.')],
        flags: 64,
      });
    }

    const chars = await CADCharacter.find({ guildId, userId });
    const ownsTicket = chars.some(
      c => c._id.toString() === ticket.characterId?.toString() || c.characterName === ticket.characterName
    );
    if (!ownsTicket) {
      return interaction.reply({
        embeds: [errorEmbed('Access Denied', 'This fine does not belong to your characters.')],
        flags: 64,
      });
    }

    const [balance, econConfig] = await Promise.all([
      EconomyBalance.findOne({ guildId, userId }),
      EconomyConfig.findOne({ guildId }),
    ]);
    const sym = econConfig?.currencySymbol || '$';
    const amount = ticket.fine || 0;

    if (!balance) {
      return interaction.reply({
        embeds: [errorEmbed('No Economy Account', 'You do not have an economy account on this server.')],
        flags: 64,
      });
    }
    if (balance.bank < amount) {
      return interaction.reply({
        embeds: [errorEmbed('Insufficient Funds', `**Required:** ${sym}${amount.toLocaleString()}\n**Bank balance:** ${sym}${balance.bank.toLocaleString()}`)],
        flags: 64,
      });
    }

    balance.bank -= amount;
    await balance.save();

    ticket.paid = true;
    ticket.paidAt = new Date();
    await ticket.save();

    const embed = new EmbedBuilder()
      .setColor('#43b581')
      .setTitle('Fine Paid')
      .setDescription(
        `**Ticket:** \`#${ticket.ticketId}\`\n` +
        `**Violation:** ${ticket.violation}\n` +
        `**Amount paid:** ${sym}${amount.toLocaleString()}\n` +
        `**Remaining bank:** ${sym}${balance.bank.toLocaleString()}`
      )
      .setFooter({ text: 'RPM' });

    return interaction.reply({ embeds: [embed], flags: 64 });
  } catch (error) {
    console.error('Error paying fine:', error);
    return interaction.reply({
      embeds: [errorEmbed('Payment Failed', 'An error occurred while processing your payment.')],
      flags: 64,
    });
  }
}
