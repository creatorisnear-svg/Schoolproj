import { recordFunnel } from './funnel.js';
import { trialUsed, rebuildWall } from './premiumCheck.js';

/**
 * Premium walls, handled once at the dispatch point.
 *
 * Walls are shown from about thirty places. Instead of teaching each of them
 * about the server they are in, the interaction is wrapped once in index.js,
 * beside the link buttons, and every reply is checked on its way out:
 *
 *   - it is counted, one wall per interaction, named after the command;
 *   - if the server has already used its free trial, the "Start the free
 *     trial" button is swapped for a link that buys Premium for this server.
 *     Offering a trial that can no longer be had sent the warmest leads, the
 *     servers that tried Premium and wanted it back, into a "Trial Already
 *     Used" dead end.
 *
 * The wall builders in premiumCheck.js mark their payloads with __wall, which
 * discord.js ignores. The wrapper never throws and never delays a reply by
 * more than a moment: a wall that could not be personalised still goes out.
 */

export const WALL_BUTTON_ID = 'premium_start_trial';
const LOOKUP_BUDGET_MS = 700;

function customIdOf(component) {
  return component?.data?.custom_id ?? component?.custom_id ?? component?.customId ?? null;
}

/** Does this payload carry a premium wall? Handles builders and plain JSON. */
export function isWall(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (payload.__wall) return true;
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

function within(promise, ms, fallback) {
  let timer;
  return Promise.race([
    promise.catch(() => fallback),
    new Promise((resolve) => { timer = setTimeout(() => resolve(fallback), ms); }),
  ]).finally(() => clearTimeout(timer));
}

/** The payload with its wall rebuilt for this server; anything else kept. */
export async function personaliseWall(payload, guildId) {
  if (!payload || typeof payload !== 'object' || !payload.__wall) return payload;
  const { __wall: marker, ...rest } = payload;
  if (!guildId) return rest;

  const used = await within(trialUsed(guildId), LOOKUP_BUDGET_MS, false);
  const wall = rebuildWall(marker, { trialUsed: used, guildId });

  // Keep whatever else the caller added (a Back button, a second embed), and
  // replace only the wall's own embed and rows.
  const otherEmbeds = (rest.embeds || []).slice(1);
  const otherRows = (rest.components || []).filter((row) => !isWallRow(row));
  return { ...rest, embeds: [...wall.embeds, ...otherEmbeds], components: [...wall.components, ...otherRows] };
}

function isWallRow(row) {
  const parts = row?.components ?? row?.data?.components ?? [];
  return Array.isArray(parts) && parts.some((c) => {
    const url = c?.data?.url ?? c?.url ?? '';
    const style = c?.data?.style ?? c?.style;
    return customIdOf(c) === WALL_BUTTON_ID || /\/pricing\?from=wall/.test(url) || style === 6;
  });
}

export function attachFunnel(interaction) {
  for (const method of ['reply', 'editReply', 'followUp', 'update']) {
    const original = interaction[method];
    if (typeof original !== 'function') continue;
    const bound = original.bind(interaction);
    interaction[method] = async (payload, ...rest) => {
      let out = payload;
      try {
        if (isWall(payload)) {
          // One wall per interaction: a reply followed by an edit of the same
          // screen is one wall, not two.
          if (!interaction.__wallCounted) {
            interaction.__wallCounted = true;
            recordFunnel({
              kind: 'wall',
              guildId: interaction.guildId || null,
              userId: interaction.user?.id || null,
              feature: featureOf(interaction),
            });
          }
          out = await personaliseWall(payload, interaction.guildId || null);
        }
      } catch {
        // Counting and personalising are never allowed to get in the way.
        out = payload;
        if (out && typeof out === 'object' && out.__wall) {
          const { __wall, ...clean } = out;
          out = clean;
        }
      }
      return bound(out, ...rest);
    };
  }
  return interaction;
}
