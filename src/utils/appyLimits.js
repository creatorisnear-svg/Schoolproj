/**
 * Which application types a server is allowed to be running.
 *
 * Applications used to be entirely Premium. Free servers now get two types, and
 * a cap on a feature like this has to hold at more than the obvious place.
 *
 * The panel message bakes its dropdown options in at the moment it is sent, so
 * checking only at creation leaves an easy way round: make two types, post a
 * panel, delete them, make two more, post a second panel. Neither panel breaks,
 * because both were built while the server was within its limit, and the server
 * ends up running four live application types on a plan that allows two.
 *
 * Three checks, and every route into the feature passes through at least one:
 *
 *   creating   refuses the third type outright
 *   sending    only ever puts the allowed types in the dropdown
 *   selecting  re-checks when somebody picks, so an old panel that already has
 *              extra options baked into it cannot be used to start one
 *
 * Ordering is by creation date, so the allowed set is the types the server made
 * first. That is stable, it does not shuffle when something is deleted, and a
 * server that drops off Premium keeps every row it ever made: the extras stop
 * being offered, and come straight back if it subscribes again. Nothing is
 * deleted for falling behind on a subscription.
 */
import AppyPanel from '../models/AppyPanel.js';
import { getGuildLimits } from './premiumCheck.js';

/**
 * The types this guild may currently offer, oldest first.
 *
 * @param {string} guildId
 * @param {string[]} [activeTypeIds] the guild's own subset, if it has chosen one
 */
export async function allowedTypes(guildId, activeTypeIds) {
  const limits = await getGuildLimits(guildId);

  let types = await AppyPanel.find({ guildId }).sort({ createdAt: 1 });

  // The cap applies to what the server has, before its own filter. Applying it
  // afterwards would let somebody hold ten types and rotate which two are
  // active, which is the same bypass in a different shape.
  if (limits.appyTypes !== Infinity) types = types.slice(0, limits.appyTypes);

  if (Array.isArray(activeTypeIds) && activeTypeIds.length) {
    types = types.filter((t) => activeTypeIds.includes(t.typeId));
  }
  return types;
}

/** Can this guild make another one, and if not, what should it be told? */
export async function canAddType(guildId) {
  const limits = await getGuildLimits(guildId);
  if (limits.appyTypes === Infinity) return { allowed: true, limit: Infinity };

  const used = await AppyPanel.countDocuments({ guildId });
  return { allowed: used < limits.appyTypes, limit: limits.appyTypes, used };
}

/**
 * Is this type one the guild is allowed to be running right now?
 *
 * The check that closes the loop. A panel posted while the server had more
 * types still has those options in its dropdown, and this is what stops one
 * being used to start an application.
 */
export async function isTypeAllowed(guildId, typeId) {
  const allowed = await allowedTypes(guildId);
  return allowed.some((t) => t.typeId === typeId);
}
