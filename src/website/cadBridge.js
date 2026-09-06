import { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } from 'discord.js';
import EmergencyCall from '../models/EmergencyCall.js';
import DispatchConfig from '../models/DispatchConfig.js';
import OfficerStatus from '../models/OfficerStatus.js';
import { rebuildStatusBoard } from '../handlers/dispatchHandler.js';

/**
 * The seam between the web CAD and Discord.
 *
 * Everything the CAD does that should be visible in Discord - a 911 embed, a
 * status board refresh, a panic alert - goes through here, so the contract with
 * the bot lives in one file instead of being restated in every route.
 *
 * Two details are easy to get wrong and both were wrong in the old portal:
 *
 *  1. Call IDs must end in a number. Dispatch reads the trailing segment aloud
 *     ("Call number 4172") and matches an officer's spoken reply against it with
 *     `callId.split('-').pop()`. The old portal generated `911-M2X8K9`, so voice
 *     dispatch could neither announce nor attach to a web-submitted call.
 *
 *  2. Panic needs `panicAnnounced: false` written explicitly. The field defaults
 *     to true, so an upsert that omits it is invisible to the panic poller.
 */

/** Matches the format /911 produces, because dispatch parses the trailing number. */
export async function generateCallId(guildId) {
  for (let i = 0; i < 8; i++) {
    const shortId = Math.floor(Math.random() * 9000 + 1000);
    const callId = `${guildId}-${shortId}`;
    const clash = await EmergencyCall.exists({ guildId, callId });
    if (!clash) return callId;
  }
  // Vanishingly unlikely; the timestamp still ends in a digit, so voice still works.
  return `${guildId}-${Date.now() % 100000}`;
}

function callEmbed(call) {
  return new EmbedBuilder()
    .setColor('#ff0000')
    .setTitle('911 Emergency Report')
    .addFields(
      { name: 'Issue', value: call.issue || 'Not given', inline: false },
      { name: 'Location', value: call.location || 'Not given', inline: true },
      { name: 'Reporter', value: call.reporterUsername || 'Unknown', inline: true },
      { name: 'Suspects & Vehicle', value: call.suspectsDescription || 'Not given', inline: false },
      { name: 'Last Seen', value: call.lastSeen || 'Not given', inline: false },
      { name: 'Contact Info', value: call.contact || 'Not given', inline: false }
    )
    .setFooter({ text: `RPM | Call ID: ${call.callId} | Submitted from the web CAD` })
    .setTimestamp();
}

function callButtons(callId) {
  // These custom IDs are what emergencyButtonHandler already listens for, so a
  // web-submitted call behaves exactly like one raised with /911.
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`911_respond_${callId}`).setLabel('Respond').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`911_attach_${callId}`).setLabel('Attach').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`911_dismiss_${callId}`).setLabel('Dismiss').setStyle(ButtonStyle.Secondary)
  );
}

async function resolveChannel(guild, channelId) {
  if (!channelId) return null;
  const cached = guild.channels.cache.get(channelId);
  if (cached?.isTextBased()) return cached;
  const fetched = await guild.channels.fetch(channelId).catch(() => null);
  return fetched?.isTextBased() ? fetched : null;
}

/**
 * Posts a web-submitted 911 into Discord, in the same channel and shape /911 uses.
 *
 * Voice announcement is deliberately NOT triggered here - the call is saved with
 * dispatchAnnounced false and the voice poller picks it up within five seconds.
 * Announcing from both places would say it twice.
 */
export async function announceWeb911(guild, call, { rpConfig, cadConfig, dispatchConfig }) {
  const channel =
    (await resolveChannel(guild, rpConfig?.use911Channel)) ||
    (await resolveChannel(guild, dispatchConfig?.dispatchChannelId));

  if (!channel) return { posted: false, reason: 'no_channel' };

  const mentions = [
    ...(cadConfig?.leoRoleIds || []),
    ...(cadConfig?.fireDepartmentRoleIds || []),
  ].map((id) => `<@&${id}>`);

  try {
    const sent = await channel.send({
      content: mentions.length ? mentions.join(' ') : '@here Emergency report incoming!',
      embeds: [callEmbed(call)],
      components: [callButtons(call.callId)],
    });
    await EmergencyCall.updateOne(
      { _id: call._id },
      { $set: { messageId: sent.id, channelId: channel.id } }
    );
    return { posted: true, channelId: channel.id };
  } catch (err) {
    // A failed Discord post must not fail the call itself - the record is saved
    // and voice dispatch still works off the database.
    console.error(`[CAD] could not post 911 ${call.callId}:`, err.message);
    return { posted: false, reason: 'send_failed' };
  }
}

/** Edits the Discord embed in place when a call changes, if one was posted. */
export async function updateCallMessage(guild, call, note) {
  if (!call.messageId || !call.channelId) return;
  const channel = await resolveChannel(guild, call.channelId);
  if (!channel) return;

  try {
    const message = await channel.messages.fetch(call.messageId);
    const embed = EmbedBuilder.from(message.embeds[0]);
    if (note) embed.setDescription(note);

    const closed = call.status === 'closed';
    await message.edit({
      embeds: [embed.setColor(closed ? '#747f8d' : '#ff0000')],
      components: closed ? [] : [callButtons(call.callId)],
    });
  } catch (err) {
    // The message may have been deleted by a moderator; that is not an error.
    if (err.code !== 10008) console.error(`[CAD] could not edit ${call.callId}:`, err.message);
  }
}

/**
 * Posts an in-character tweet, as /civiliandatabase does.
 *
 * The author is shown - that is the point of a public feed, and it matches the
 * embed the Discord version builds.
 */
export async function postTweet(guild, rpConfig, { message, author, avatarUrl }) {
  const channel = await resolveChannel(guild, rpConfig?.twitterChannel);
  if (!channel) return { posted: false, reason: 'no_channel' };

  const embed = new EmbedBuilder()
    .setColor('#1DA1F2')
    .setTitle('Twitter Post')
    .setDescription(message)
    .setAuthor(avatarUrl ? { name: author, iconURL: avatarUrl } : { name: author })
    .setFooter({ text: 'RPM' })
    .setTimestamp();

  try {
    await channel.send({ embeds: [embed] });
    return { posted: true };
  } catch (err) {
    console.error('[CAD] tweet failed:', err.message);
    return { posted: false, reason: 'send_failed' };
  }
}

/**
 * Posts an anonymous message.
 *
 * No author, no avatar, nothing identifying - same as the Discord version. Note
 * this hides the poster from other players, not from Discord: the bot sent it,
 * so staff cannot trace it back either.
 */
export async function postAnonymous(guild, rpConfig, { message }) {
  const channel = await resolveChannel(guild, rpConfig?.anonChannel);
  if (!channel) return { posted: false, reason: 'no_channel' };

  const embed = new EmbedBuilder()
    .setColor('#808080')
    .setTitle('Anonymous Message')
    .setDescription(message)
    .setFooter({ text: 'RPM' })
    .setTimestamp();

  try {
    await channel.send({ embeds: [embed] });
    return { posted: true };
  } catch (err) {
    console.error('[CAD] anonymous post failed:', err.message);
    return { posted: false, reason: 'send_failed' };
  }
}

/** Refreshes the Discord status board after a web status change. */
export async function refreshStatusBoard(guild) {
  try {
    const config = await DispatchConfig.findOne({ guildId: guild.id }).lean();
    if (config?.statusBoardChannelId) await rebuildStatusBoard(guild, config);
  } catch (err) {
    console.error('[CAD] status board refresh failed:', err.message);
  }
}

/**
 * Writes an officer's status.
 *
 * panicAnnounced tracks one thing: is there a distress call still waiting to be
 * shouted. So it is false only for a 10-99, and true for every other code -
 * an officer who has gone back to 10-8 is telling us they are fine, and a
 * pending panic on an available unit is a contradiction.
 *
 * Setting it true never causes an announcement, only suppresses a stale one, so
 * this direction is the safe one.
 */
export async function setOfficerStatus(guildId, userId, username, fields) {
  const panic = fields.tenCode === '10-99';
  const update = {
    guildId,
    userId,
    username,
    tenCode: fields.tenCode,
    subject: fields.subject ?? null,
    location: fields.location ?? null,
    updatedAt: new Date(),
    panicAnnounced: !panic,
  };

  return OfficerStatus.findOneAndUpdate(
    { guildId, userId },
    { $set: update },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}
