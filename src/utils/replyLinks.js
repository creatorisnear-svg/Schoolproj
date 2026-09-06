/**
 * The CAD and website buttons, and which messages get them.
 *
 * Adding them by hand was not an option: there are over 1300 reply sites across
 * the commands and handlers, and any one of them missed would be the one
 * somebody noticed. So the interaction itself is wrapped once, at the single
 * dispatch point in index.js, and every reply passes through here on its way
 * out.
 *
 * WHICH MESSAGES
 *
 * A message that already carries controls of its own is a screen somebody is
 * working in: a menu, a Back button, Respond and Attach on a 911 call. A
 * message with no controls is an acknowledgement, "Deposited $50", "Strike
 * removed", an error. The buttons go on the first kind.
 *
 * The first attempt measured the text instead, on the theory that screens are
 * longer than confirmations. That held for the fixed copy I could measure by
 * running each command against an empty database, and fell apart on everything
 * built from real data: a LEO plate lookup is 128 characters, a 911 call before
 * anyone fills in the optional fields is 134, a new character's record is 77.
 * Those are exactly the screens the CAD link exists for, and they would all
 * have lost it, while an inventory got the buttons at fifteen items and lost
 * them at three. Controls do not vary with how much data a record happens to
 * hold, so this rule does not either.
 *
 * WHAT THE WRAPPER MUST NOT DO
 *
 *   - exceed five action rows, or Discord rejects the message and the user sees
 *     "this interaction failed" instead of their reply
 *   - add the row twice on an edit
 *   - introduce a `components` key to a payload that had none. On an edit,
 *     omitting the key leaves the message's existing controls alone; sending
 *     one replaces them. Only ever appending to a list the caller already
 *     passed means an edit can never wipe a menu that is still on screen.
 *   - modify the caller's payload, since some handlers build one and send it to
 *     several places
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
 * A copy of the payload with the link row appended.
 *
 * Returns the payload untouched when the message carries no controls of its
 * own, when the links are already there, when there is no room, or when the
 * caller opted out with `links: false`. `links: true` forces them on for a
 * screen that is all text, such as /cad and /activatetrial.
 */
export function withLinks(payload) {
  if (payload == null) return payload;

  // A bare string carries no components, so it is an acknowledgement.
  if (typeof payload !== 'object') return payload;

  // Anything that is not a plain payload object (a MessagePayload, an
  // attachment builder) is left alone rather than guessed at. Checked before
  // the `links` flag is read, so that flag can never flatten a class instance
  // into a plain object on its way through.
  if (payload.constructor && payload.constructor !== Object) return payload;

  const forced = payload.links;
  let body = payload;
  if (forced !== undefined) {
    const { links, ...rest } = payload;
    if (forced === false) return rest;
    body = rest;
  }

  const rows = body.components;
  if (!Array.isArray(rows)) return body;      // never introduce the key
  if (forced !== true && rows.length === 0) return body;
  if (rows.length >= 5) return body;
  if (rows.some(isLinkRow)) return body;

  return { ...body, components: [...rows, linkRow()] };
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
