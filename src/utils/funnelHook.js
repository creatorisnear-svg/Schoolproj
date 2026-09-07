import { recordFunnel } from './funnel.js';

/**
 * Counting premium walls without touching the places that show them.
 *
 * Every wall the bot shows carries the same Start Free Trial button, whether
 * it came from a premium feature, a free tier cap, or setup. So instead of a
 * counter in each of those places, the interaction is wrapped once at the
 * dispatch point in index.js, beside the link buttons, and every reply that
 * goes out is checked for that button on its way.
 *
 * The wrapper never changes a payload and never throws: a wall that could not
 * be counted is still shown.
 */

export const WALL_BUTTON_ID = 'premium_start_trial';

function customIdOf(component) {
  return component?.data?.custom_id ?? component?.custom_id ?? component?.customId ?? null;
}

/** Does this payload carry the wall's trial button? Handles builders and plain JSON. */
export function isWall(payload) {
  if (!payload || typeof payload !== 'object') return false;
  const rows = payload.components;
  if (!Array.isArray(rows)) return false;
  return rows.some((row) => {
    const parts = row?.components ?? row?.data?.components ?? [];
    return Array.isArray(parts) && parts.some((c) => customIdOf(c) === WALL_BUTTON_ID);
  });
}

/**
 * What showed the wall, as the closest thing to a feature name the
 * interaction knows: the command and subcommand, or the control's id.
 */
export function featureOf(interaction) {
  if (interaction?.commandName) {
    let sub = null;
    try { sub = interaction.options?.getSubcommand?.(false) || null; } catch { sub = null; }
    return sub ? `/${interaction.commandName} ${sub}` : `/${interaction.commandName}`;
  }
  if (interaction?.customId) return String(interaction.customId);
  return 'unknown';
}

export function attachFunnel(interaction) {
  for (const method of ['reply', 'editReply', 'followUp', 'update']) {
    const original = interaction[method];
    if (typeof original !== 'function') continue;
    const bound = original.bind(interaction);
    interaction[method] = (payload, ...rest) => {
      try {
        // One wall per interaction: a reply followed by an edit of the same
        // screen is one wall, not two.
        if (!interaction.__wallCounted && isWall(payload)) {
          interaction.__wallCounted = true;
          recordFunnel({
            kind: 'wall',
            guildId: interaction.guildId || null,
            userId: interaction.user?.id || null,
            feature: featureOf(interaction),
          });
        }
      } catch {
        // Counting is never allowed to get in the way of the reply.
      }
      return bound(payload, ...rest);
    };
  }
  return interaction;
}
