import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import DirectoryListing from '../models/DirectoryListing.js';
import { isPremiumGuild } from '../utils/premiumCheck.js';
import { listingStats, bumpListing, BUMP_COOLDOWN_MS, PLATFORMS, REGIONS } from '../utils/directory.js';

/**
 * /directory: this server's place in the public server directory at
 * roleplaymanager.xyz/servers. Shows how the listing is doing and bumps it.
 * Writing the listing itself happens on the dashboard, which has room for a
 * description, platforms and tags.
 */

const SITE = 'https://roleplaymanager.xyz';

export const data = new SlashCommandBuilder()
  .setName('directory')
  .setDescription('Get new members: list this server in the RolePlayManager server directory, and bump it')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

const link = (label, url) => new ButtonBuilder().setLabel(label).setStyle(ButtonStyle.Link).setURL(url);

export async function directoryView(guild, note = '') {
  const [listing, premium] = await Promise.all([
    DirectoryListing.findOne({ guildId: guild.id }).lean(),
    isPremiumGuild(guild.id).catch(() => false),
  ]);
  const manage = SITE + '/dashboard/?guild=' + guild.id + '&section=directory';
  const embed = new EmbedBuilder().setColor(0x2d2d2d).setTitle('Server Directory').setFooter({ text: 'RPM' });
  const listed = !!(listing && listing.listed && !listing.hidden && listing.inviteCode);

  if (!listed) {
    embed.setDescription(
      (note ? note + '\n\n' : '') +
      'Get new members. The RolePlayManager server directory at roleplaymanager.xyz/servers is where PS5 and Xbox players look for a GTA RP server to join.\n\n' +
      '**Listing is free.** Write a short description, pick your platforms and switch it on. It takes a minute on the dashboard.\n\n' +
      (listing && listing.hidden
        ? '-# This listing was removed from the directory. Contact support if you think that was a mistake.'
        : '-# Premium servers get a Premium badge and are listed above free servers.')
    );
    return {
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(link('List this server', manage), link('See the directory', SITE + '/servers/'))],
    };
  }

  const stats = await listingStats(guild.id);
  const cooldown = premium ? BUMP_COOLDOWN_MS.premium : BUMP_COOLDOWN_MS.free;
  const next = listing.bumpedAt ? new Date(listing.bumpedAt).getTime() + cooldown : 0;
  const canBump = Date.now() >= next;
  const featured = listing.featuredUntil && new Date(listing.featuredUntil) > new Date();

  embed.setDescription(
    (note ? note + '\n\n' : '') +
    `**${guild.name}** is listed in the server directory.\n\n` +
    `**Votes:** ${stats.votes} in the last 30 days\n` +
    `**Join clicks:** ${stats.joinClicks} in the last 30 days\n` +
    `**Platforms:** ${(listing.platforms || []).map((p) => PLATFORMS[p] || p).join(', ') || 'none set'}\n` +
    `**Region:** ${REGIONS[listing.region] || 'not set'}\n` +
    (featured ? `**Featured** until <t:${Math.floor(new Date(listing.featuredUntil).getTime() / 1000)}:D>\n` : '') +
    '\nBumping moves this server to the top of Recently Bumped. ' +
    (canBump ? 'You can bump now.' : `Next bump <t:${Math.floor(next / 1000)}:R>.`) +
    `\n-# Every ${cooldown / 3600000} hours` + (premium ? ' with Premium.' : '. Premium servers can bump every 2 hours.')
  );

  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('directory_bump').setLabel('Bump').setStyle(ButtonStyle.Success).setDisabled(!canBump),
      link('Edit or feature', manage),
      link('See the directory', SITE + '/servers/'),
    )],
  };
}

export async function execute(interaction) {
  await interaction.deferReply({ flags: 64 });
  await interaction.editReply(await directoryView(interaction.guild));
}

/** The Bump button under /directory. */
export async function handleDirectoryBump(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({ content: 'Only staff who can manage this server can bump it.', flags: 64 });
  }
  const premium = await isPremiumGuild(interaction.guildId).catch(() => false);
  const result = await bumpListing(interaction.guildId, interaction.user.id, premium);
  if (!result.ok && result.reason === 'cooldown') {
    return interaction.reply({ content: `Bumped recently. You can bump again <t:${Math.floor(result.nextAt.getTime() / 1000)}:R>.`, flags: 64 });
  }
  if (!result.ok) {
    return interaction.reply({ content: 'This server is not listed yet. List it from the dashboard first.', flags: 64 });
  }
  return interaction.update(await directoryView(interaction.guild, '**Bumped.** This server is at the top of Recently Bumped.'));
}
