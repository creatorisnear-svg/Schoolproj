import mongoose from 'mongoose';
import { FEATURES, getFeature } from '../config/features.js';

/**
 * Feature status - the difference between "switched on" and "actually works".
 *
 * Before this existed, `enabled` was the only signal, and setupWizardHandler's
 * ensureEnabled() set it the moment an admin opened a feature's menu. So the
 * /setup checklist and the dashboard's "N/15 active" counter both counted menus
 * that had been glanced at. A server could read 12/15 with nothing configured.
 *
 * A feature is:
 *   'off'        - the enabled flag is false (or the config document is absent)
 *   'incomplete' - enabled, but a field it genuinely needs is still empty
 *   'ready'      - enabled and every required field is set
 *
 * The required[] list on each registry entry is the whole mechanism. It holds
 * only fields the runtime actually bails out on, not every settable option.
 */

const modelCache = new Map();

async function loadModel(feature) {
  if (modelCache.has(feature.key)) return modelCache.get(feature.key);
  try {
    const mod = await import(`../${feature.modelFile}`);
    const model = feature.modelImport === 'default' ? mod.default : mod[feature.modelImport];
    modelCache.set(feature.key, model ?? null);
    return model ?? null;
  } catch (err) {
    console.error(`[FeatureStatus] Could not load model for ${feature.key}:`, err.message);
    modelCache.set(feature.key, null);
    return null;
  }
}

/** Read a dot-path ('a.b.c') off a document without throwing on a missing link. */
function readPath(doc, path) {
  if (!doc || !path) return undefined;
  return path.split('.').reduce((acc, part) => (acc == null ? undefined : acc[part]), doc);
}

/** Empty means unset: null, undefined, '', or an empty array. 0 and false are values. */
function isBlank(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/**
 * Status for one feature in one guild.
 * Returns { status, enabled, missing[] } - `missing` names the required fields
 * that are still empty, so callers can tell an owner what is left to do.
 */
export async function getFeatureStatus(guildId, featureKey) {
  const feature = getFeature(featureKey);
  if (!feature) return { status: 'off', enabled: false, missing: [] };

  if (mongoose.connection.readyState !== 1) {
    return { status: 'unknown', enabled: false, missing: [] };
  }

  const Model = await loadModel(feature);
  if (!Model) return { status: 'off', enabled: false, missing: [] };

  let doc;
  try {
    doc = await Model.findOne({ guildId }).lean();
  } catch (err) {
    console.error(`[FeatureStatus] Query failed for ${feature.key}:`, err.message);
    return { status: 'unknown', enabled: false, missing: [] };
  }

  if (!doc) {
    return { status: 'off', enabled: false, missing: [...feature.required] };
  }

  // A feature with no enabled flag (general settings, staff) is on as soon as
  // its document exists - there is nothing to switch.
  const enabled = feature.enabledPath ? Boolean(readPath(doc, feature.enabledPath)) : true;
  const missing = feature.required.filter((field) => isBlank(readPath(doc, field)));

  if (!enabled) return { status: 'off', enabled: false, missing };
  return { status: missing.length ? 'incomplete' : 'ready', enabled: true, missing };
}

/**
 * Status for every feature in one guild, keyed by feature key.
 * One query per feature, run concurrently.
 */
export async function getAllFeatureStatus(guildId) {
  const entries = await Promise.all(
    FEATURES.map(async (feature) => [feature.key, await getFeatureStatus(guildId, feature.key)])
  );
  return Object.fromEntries(entries);
}

/** Counts for headline summaries: "6 ready, 3 need setup". */
export function summarize(statusMap) {
  const values = Object.values(statusMap);
  return {
    ready: values.filter((v) => v.status === 'ready').length,
    incomplete: values.filter((v) => v.status === 'incomplete').length,
    off: values.filter((v) => v.status === 'off').length,
    total: values.length,
  };
}
