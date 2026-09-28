import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import DirectoryListing from '../models/DirectoryListing.js';
import { checkStaffPermission } from '../utils/permissions.js';
import { backRow } from '../utils/setupNav.js';
import {
  PLATFORMS, REGIONS, TAGS, MAX_TAGS, MIN_MEMBERS,
  cleanListingInput, goLive, invalidateDirectory, listingStats,
} from '../utils/directory.js';

/**
 * The Server Directory screen inside /setup.
 *
 * Everything a listing needs, done without leaving Discord: platforms, region
 * and type of RP from menus, the description in a pop-up, and a List button
 * that puts it live under the same rules as the dashboard (goLive in
 * utils/directory.js), so the two can never disagree about what a listing
 * needs.
 */

const SITE = 'https://roleplaymanager.xyz';

const state = (ok) => (ok ? 'done' : 'still needed');

function options(map, selected) {
  return Object.entries(map).map(([value, label]) => ({ label, value, default: selected.includes(value) }));
}

export async function directorySetupView(guild, note = '') {
  const listing = (await DirectoryListing.findOne({ guildId: guild.id }).lean()) || {};
  const listed = !!(listing.listed && !listing.hidden && listing.inviteCode);
  const description = listing.description || '';
  const platforms = listing.platforms || [];
  const tags = listing.tags || [];
  const region = listing.region || 'na';
  const members = guild.memberCount || 0;

  const lines = [];
  if (note) lines.push(note, '');
  if (listing.hidden) {
    lines.push('**This listing was removed from the directory.** Contact support if you think that was a mistake.', '');
  }
  lines.push(listed
    ? `**${guild.name} is listed** at roleplaymanager.xyz/servers. Changes you make here show there within a minute.`
    : 'Get new members. The server directory at roleplaymanager.xyz/servers is where PS5 and Xbox players look for a GTA RP server to join. Listing is free.');
  lines.push('');

  if (!listed) {
    lines.push('**To list it**');
    lines.push(`Description, 20 characters or more: ${state(description.length >= 20)}`);
    lines.push(`At least one platform: ${state(platforms.length > 0)}`);
    lines.push(`At least ${MIN_MEMBERS} members: ${state(members >= MIN_MEMBERS)}`);
    lines.push('');
  } else {
    const stats = await listingStats(guild.id);
    lines.push(`**Votes:** ${stats.votes} in the last 30 days · **Join clicks:** ${stats.joinClicks}`);
    lines.push('');
  }

  lines.push(`**Platforms:** ${platforms.map((p) => PLATFORMS[p] || p).join(', ') || 'none picked'}`);
  lines.push(`**Region:** ${REGIONS[region] || 'not set'}`);
  lines.push(`**Type of roleplay:** ${tags.map((t) => TAGS[t] || t).join(', ') || 'none picked'}`);
  lines.push('**Description:**');
  lines.push(description ? description.split('\n').map((l) => '> ' + l).join('\n') : '> not written yet');

  const embed = new EmbedBuilder()
    .setColor(0x2d2d2d)
    .setTitle('Server Directory')
    .setDescription(lines.join('\n').slice(0, 4000))
    .setFooter({ text: 'RPM · Premium servers get a badge and are listed above free servers' });

  const rows = [
    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
      .setCustomId('dirsetup_platforms')
      .setPlaceholder('Platforms')
      .setMinValues(0)
      .setMaxValues(Object.keys(PLATFORMS).length)
      .addOptions(options(PLATFORMS, platforms))),
    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
      .setCustomId('dirsetup_region')
      .setPlaceholder('Region')
      .addOptions(options(REGIONS, [region]))),
    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
      .setCustomId('dirsetup_tags')
      .setPlaceholder(`Type of roleplay, up to ${MAX_TAGS}`)
      .setMinValues(0)
      .setMaxValues(MAX_TAGS)
      .addOptions(options(TAGS, tags))),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('dirsetup_description')
        .setLabel(description ? 'Edit description' : 'Write description')
        .setStyle(description ? ButtonStyle.Secondary : ButtonStyle.Primary),
      listed
        ? new ButtonBuilder().setCustomId('dirsetup_list').setLabel('Take it off the directory').setStyle(ButtonStyle.Danger)
        : new ButtonBuilder().setCustomId('dirsetup_list').setLabel('List this server').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setLabel('See the directory').setStyle(ButtonStyle.Link).setURL(SITE + '/servers/'),
    ),
    // Back to /setup, and the fifth row, so nothing else gets added below.
    backRow(),
  ];

  return { embeds: [embed], components: rows };
}

/** Every dirsetup_ select, button and the description pop-up. */
export async function handleDirectorySetup(interaction) {
  if (!interaction.inGuild()) return;
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({ content: 'Only staff and administrators can change the directory listing.', flags: 64 });
  }

  const id = interaction.customId;
  const guild = interaction.guild;

  if (id === 'dirsetup_description') {
    const current = await DirectoryListing.findOne({ guildId: guild.id }).lean();
    const input = new TextInputBuilder()
      .setCustomId('description')
      .setLabel('Describe your server')
      .setStyle(TextInputStyle.Paragraph)
      .setMinLength(20)
      .setMaxLength(500)
      .setRequired(true)
      .setPlaceholder('Serious PS5 roleplay with LSPD, BCSO, Fire and EMS. Weekly sessions, active staff.');
    if (current?.description) input.setValue(current.description.slice(0, 500));
    return interaction.showModal(new ModalBuilder()
      .setCustomId('dirsetup_description_modal')
      .setTitle('Server Directory')
      .addComponents(new ActionRowBuilder().addComponents(input)));
  }

  let note = '';
  let input = {};
  if (id === 'dirsetup_platforms') { input = cleanListingInput({ platforms: interaction.values }); note = 'Platforms saved.'; }
  else if (id === 'dirsetup_region') { input = cleanListingInput({ region: interaction.values[0] }); note = 'Region saved.'; }
  else if (id === 'dirsetup_tags') { input = cleanListingInput({ tags: interaction.values }); note = 'Type of roleplay saved.'; }
  else if (id === 'dirsetup_description_modal') {
    input = cleanListingInput({ description: interaction.fields.getTextInputValue('description') });
    note = 'Description saved.';
  }

  const listing = await DirectoryListing.findOne({ guildId: guild.id }) || new DirectoryListing({ guildId: guild.id });
  Object.assign(listing, input);
  listing.updatedBy = interaction.user.id;

  if (id === 'dirsetup_list') {
    if (listing.listed && !listing.hidden) {
      listing.listed = false;
      note = '**Taken off the directory.** Your details are kept, so listing again is one press.';
    } else {
      const live = await goLive(guild, listing);
      if (live.ok) {
        note = `**Listed.** ${guild.name} is in the directory now. Run \`/directory\` any time to bump it to the top.`;
      } else {
        listing.listed = false;
        note = '**Not listed yet.** ' + live.error;
      }
    }
  } else if (listing.listed) {
    // An edit to a live listing must not leave it breaking the rules, for
    // example every platform unticked.
    const live = await goLive(guild, listing);
    if (!live.ok) {
      listing.listed = false;
      note += ' It is off the directory until that is fixed: ' + live.error;
    }
  }

  await listing.save();
  invalidateDirectory();

  const view = await directorySetupView(guild, note);
  if (interaction.isModalSubmit() && !interaction.isFromMessage()) {
    return interaction.reply({ ...view, flags: 64 });
  }
  return interaction.update(view);
}
