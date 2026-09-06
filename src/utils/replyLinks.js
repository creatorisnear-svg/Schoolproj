/**
 * The CAD and website buttons that sit under every reply.
 *
 * Adding them by hand was not an option: there are over 1300 reply sites across
 * the commands and handlers, and any one of them missed would be the one
 * somebody noticed. So the interaction itself is wrapped once, at the single
 * dispatch point in index.js, and every reply that passes through gets the row
 * appended on its way out.
 *
 * Rules the wrapper has to respect, because Discord rejects the message
 * otherwise and the user sees "this interaction failed" instead of their reply:
 *
 *   - five action rows per message, no more
 *   - a row of link buttons cannot be added twice
 *   - the caller's payload object is not ours to modify, since some handlers
 *     build one and send it to several places
 */
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export const SITE_URL = 'https://roleplaymanager.xyz';
export const CAD_URL = 'https://roleplaymanager.xyz/cad';

/** Marker so a row we added is never added a second time on an edit. */
const OURS = new Set([SITE_URL, CAD_URL]);

/** The row itself. Built fresh each time; builders are not safe to share. */
export function linkRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel('Open CAD').setStyle(ButtonStyle.Link).setURL(CAD_URL),
    new ButtonBuilder().setLabel('Website').setStyle(ButtonStyle.Link).setURL(SITE_URL)
  );
}

/** Does this row already carry our links? Handles builders and plain JSON. */
function isLinkRow(row) {
  const parts = row?.components ?? row?.data?.components ?? [];
  return parts.some((c) => OURS.has(c?.url ?? c?.data?.url));
}

/**
 * Does this message present something, or just confirm something?
 *
 * The buttons started out under every reply, which put them under "Deposited"
 * and "Money Given" and every one line error, where two link buttons are longer
 * than the message they follow. They belong under a screen somebody is reading:
 * the setup pages, the databases, /help, /premium, a record.
 *
 * Measured across all 115 command paths, the two groups separate cleanly. Every
 * acknowledgement came in at 195 characters or fewer and every real screen at
 * 242 or more, so the threshold below sits in an actual gap rather than at a
 * number picked for looking round. Anything with fields is a screen regardless
 * of length.
 */
function isSubstantive(payload) {
  const embeds = payload.embeds;
  if (!Array.isArray(embeds) || !embeds.length) return false;
  const first = embeds[0];
  const data = first?.data ?? first;
  if (!data || typeof data !== 'object') return false;
  if (Array.isArray(data.fields) && data.fields.length > 0) return true;
  return typeof data.description === 'string' && data.description.length >= 200;
}

/**
 * A copy of the payload with the link row appended.
 *
 * Returns the payload untouched when there is no room, when the links are
 * already there, when the message is a brief acknowledgement, or when the
 * caller opted out with `links: false`. `links: true` forces them on.
 */
export function withLinks(payload) {
  if (payload == null) return payload;

  // A bare string is content with no embed, so it is an acknowledgement by
  // definition and never carries the links.
  if (typeof payload === 'string') return payload;
  if (typeof payload !== 'object') return payload;

  // Explicit wins over the heuristic, in both directions.
  const forced = payload.links;
  if (forced !== undefined) {
    const { links, ...rest } = payload;
    if (forced === false) return rest;
    payload = rest;
  }

  // Anything that is not a plain payload object (a MessagePayload, an
  // attachment builder) is left alone rather than guessed at.
  if (payload.constructor && payload.constructor !== Object) return payload;

  if (forced !== true && !isSubstantive(payload)) return payload;

  const rows = Array.isArray(payload.components) ? payload.components : [];
  if (rows.length >= 5) return payload;
  if (rows.some(isLinkRow)) return payload;

  return { ...payload, components: [...rows, linkRow()] };
}

/**
 * Wrap one interaction so everything it sends carries the links.
 *
 * showModal is deliberately not wrapped: a modal has no components array of
 * this kind and Discord rejects one that does.
 */
export function attachLinks(interaction) {
  for (const method of ['reply', 'editReply', 'followUp', 'update']) {
    const original = interaction[method];
    if (typeof original !== 'function') continue;
    const bound = original.bind(interaction);
    interaction[method] = (payload, ...rest) => bound(withLinks(payload), ...rest);
  }
  return interaction;
}
