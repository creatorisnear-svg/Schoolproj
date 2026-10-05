import CyberComTrial from '../models/CyberComTrial.js';
import { cyberComSubscribed, cyberComChanged } from './access.js';

/**
 * RPM CyberCom free for four days, once per server, with nothing to pay and no
 * card. While it runs the server has everything a subscriber has (access.js
 * counts the trial). When it ends, the coordinator's next scan takes the
 * helpers out of the voice channels; channels and settings are kept, so
 * subscribing puts it all straight back. Whoever started it hears the day
 * before, and again when it ends.
 */
export const CYBERCOM_TRIAL_DAYS = 4;
const DAY = 24 * 60 * 60 * 1000;
const SITE = 'https://roleplaymanager.xyz';

export function cyberComTrialOf(guildId) {
  return CyberComTrial.findOne({ guildId }).lean();
}

/** Start the trial: { ok: true, endsAt }, or { ok: false, reason: 'subscribed' | 'used' }. */
export async function startCyberComTrial(guildId, userId) {
  if (await cyberComSubscribed(guildId)) return { ok: false, reason: 'subscribed' };
  if (await CyberComTrial.exists({ guildId })) return { ok: false, reason: 'used' };
  const endsAt = new Date(Date.now() + CYBERCOM_TRIAL_DAYS * DAY);
  try {
    await CyberComTrial.create({ guildId, startedBy: userId, endsAt });
  } catch (err) {
    // Two clicks at once: the unique index lets one through.
    if (err?.code === 11000) return { ok: false, reason: 'used' };
    throw err;
  }
  await cyberComChanged(guildId);
  return { ok: true, endsAt };
}

/** Run every half hour: the note the day before, then the end. */
export async function runCyberComTrialJob(client) {
  const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
  const { dmUsers } = await import('../utils/premiumNotify.js');
  const now = new Date();
  const nameOf = (guildId) => client.guilds.cache.get(guildId)?.name || 'your server';
  const keep = (guildId) => [new ActionRowBuilder().addComponents(new ButtonBuilder()
    .setLabel('Keep RPM CyberCom').setStyle(ButtonStyle.Link).setURL(`${SITE}/pricing?from=cybercom&guild=${guildId}#cybercom`))];
  const card = (title, body) => new EmbedBuilder().setColor(0x2d2d2d).setTitle(title).setDescription(body).setFooter({ text: 'RPM' });

  const ending = await CyberComTrial.find({ endsAt: { $gt: now, $lt: new Date(now.getTime() + DAY) }, endingSoonSent: { $ne: true } });
  for (const trial of ending) {
    trial.endingSoonSent = true;
    await trial.save();
    if (await cyberComSubscribed(trial.guildId).catch(() => false)) continue;
    const hours = Math.max(1, Math.round((trial.endsAt - now) / 3600000));
    await dmUsers(client, [trial.startedBy], {
      embeds: [card(`Your RPM CyberCom trial ends in about ${hours} hours`,
        `The free trial in **${nameOf(trial.guildId)}** ends <t:${Math.floor(trial.endsAt.getTime() / 1000)}:R>. ` +
        'Then the helper bots leave your voice channels, and traffic stops, 10-80s, transcripts and voice moderation stop.\n\n' +
        'Keeping it is $9.99 a month, with or without Premium. Your channels and settings stay as they are.')],
      components: keep(trial.guildId),
    });
  }

  const ended = await CyberComTrial.find({ endsAt: { $lte: now }, endedSent: { $ne: true } });
  for (const trial of ended) {
    trial.endedSent = true;
    await trial.save();
    // The helpers leave on the coordinator's next scan.
    await cyberComChanged(trial.guildId);
    if (await cyberComSubscribed(trial.guildId).catch(() => false)) continue;
    await dmUsers(client, [trial.startedBy], {
      embeds: [card('Your RPM CyberCom trial has ended',
        `The helper bots have left the voice channels in **${nameOf(trial.guildId)}**. Nothing was charged.\n\n` +
        'Your channels and settings are kept, so subscribing puts everything straight back: $9.99 a month, with or without Premium.')],
      components: keep(trial.guildId),
    });
  }
}
