import { Routes } from 'discord.js';
import GuildBranding from '../models/GuildBranding.js';

/**
 * Premium branding: the bot under the server's own name, picture, banner and
 * profile text, on that server only. Discord lets an app set these per server
 * through Modify Current Member. Other bots charge $5 to $7 a month for it.
 */

const IMAGE = /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

function imageOk(v) {
  if (v === undefined || v === null) return true;
  if (typeof v !== 'string' || !IMAGE.test(v)) return false;
  const bytes = Math.floor((v.length - v.indexOf(',') - 1) * 3 / 4);
  return bytes <= MAX_IMAGE_BYTES;
}

/** Validate what the dashboard sent. Returns { body } for Discord or { error }. */
export function brandingBody(input = {}) {
  const body = {};
  if ('nick' in input) {
    const nick = input.nick === null ? null : String(input.nick).replace(/\s+/g, ' ').trim().slice(0, 32);
    body.nick = nick || null;
  }
  if ('bio' in input) {
    const bio = input.bio === null ? null : String(input.bio).trim().slice(0, 190);
    body.bio = bio || null;
  }
  for (const key of ['avatar', 'banner']) {
    if (!(key in input)) continue;
    if (!imageOk(input[key])) return { error: 'The ' + key + ' must be a PNG, JPG, GIF or WebP image under 2 MB.' };
    body[key] = input[key] || null;
  }
  return { body };
}

export async function applyBranding(client, guildId, input, userId) {
  const { body, error } = brandingBody(input);
  if (error) return { ok: false, error };
  if (!Object.keys(body).length) return { ok: false, error: 'Nothing to change.' };
  try {
    await client.rest.patch(Routes.guildMember(guildId, '@me'), { body, reason: 'RolePlayManager Premium branding' });
  } catch (err) {
    const msg = err?.rawError?.message || err?.message || 'Discord refused the change.';
    return { ok: false, error: 'Discord refused the change: ' + msg };
  }
  const set = { appliedAt: new Date(), appliedBy: userId || null };
  if ('nick' in body) set.nick = body.nick;
  if ('bio' in body) set.bio = body.bio;
  if ('avatar' in body) set.hasAvatar = !!body.avatar;
  if ('banner' in body) set.hasBanner = !!body.banner;
  await GuildBranding.findOneAndUpdate({ guildId }, { $set: set }, { upsert: true });
  return { ok: true };
}

/** Put the bot back to its normal look on a server. */
export async function resetBranding(client, guildId) {
  const row = await GuildBranding.findOne({ guildId }).lean();
  if (!row) return { ok: true, nothing: true };
  try {
    await client.rest.patch(Routes.guildMember(guildId, '@me'), {
      body: { nick: null, avatar: null, banner: null, bio: null },
      reason: 'RolePlayManager branding reset',
    });
  } catch (err) {
    // Left the server, or lost permission: nothing more to undo there.
    console.warn('[Branding] reset on ' + guildId + ' failed:', err?.message);
  }
  await GuildBranding.deleteOne({ guildId });
  return { ok: true };
}
