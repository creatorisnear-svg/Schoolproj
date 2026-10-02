import { Client, GatewayIntentBits, Options } from 'discord.js';

/**
 * The helper bots: "RPM CyberCom 1" to "RPM CyberCom 10".
 *
 * Discord lets one bot account be in one voice channel per server, so to sit
 * in several channels at once RPM CyberCom needs several accounts. Their
 * tokens are in VOICE_HELPER_TOKENS, comma separated. They only listen and
 * speak; the main bot does every move and every CAD update, so each helper
 * needs just View Channel, Connect and Speak.
 */
export const HELPER_PERMISSIONS = '3146752';

let helpers = [];

export async function startHelpers() {
  const tokens = String(process.env.VOICE_HELPER_TOKENS || '').split(/[\s,]+/).filter(Boolean);
  if (!tokens.length) {
    console.log('[CyberCom] No helper bots set up (VOICE_HELPER_TOKENS is empty)');
    return 0;
  }
  helpers = tokens.map((token, i) => {
    const client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
      // Helpers never read messages or member lists: keep their memory small.
      makeCache: Options.cacheWithLimits({
        ...Options.DefaultMakeCacheSettings,
        MessageManager: 0,
        PresenceManager: 0,
        ReactionManager: 0,
        GuildMemberManager: { maxSize: 25, keepOverLimit: (m) => m.id === m.client.user?.id },
      }),
    });
    const helper = { index: i + 1, client, ready: false, busy: new Map(), token };
    client.once('clientReady', () => {
      helper.ready = true;
      console.log(`[CyberCom] Helper ${helper.index} ready as ${client.user.tag} in ${client.guilds.cache.size} server(s)`);
    });
    client.on('error', (err) => console.error(`[CyberCom] Helper ${helper.index} error:`, err.message));
    return helper;
  });
  await Promise.all(helpers.map((h) => h.client.login(h.token)
    .catch((err) => console.error(`[CyberCom] Helper ${h.index} could not log in:`, err.message))
    .finally(() => { delete h.token; })));
  return helpers.length;
}

export const allHelpers = () => helpers.filter((h) => h.ready);
export const everyHelper = () => helpers;
export const helperCount = () => helpers.length;

export function helperUserIds() {
  return new Set(helpers.map((h) => h.client.user?.id).filter(Boolean));
}

/** Helpers that have been added to this server. */
export function helpersInGuild(guildId) {
  return allHelpers().filter((h) => h.client.guilds.cache.has(guildId));
}

/** A helper in this server that is not already sitting in one of its channels. */
export function freeHelper(guildId) {
  return helpersInGuild(guildId).find((h) => !h.busy.has(guildId)) || null;
}

export function inviteUrl(helper) {
  const id = helper.client.application?.id || helper.client.user?.id;
  return `https://discord.com/oauth2/authorize?client_id=${id}&permissions=${HELPER_PERMISSIONS}&scope=bot`;
}

/** Tests only: stand-in helpers. */
export function __setHelpersForTest(list) { helpers = list; }
