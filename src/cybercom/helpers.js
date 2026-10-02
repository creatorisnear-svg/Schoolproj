import { Client, GatewayIntentBits, Options } from 'discord.js';

/**
 * The helper bots: "RPM CyberCom 1" to "RPM CyberCom 16".
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
  const listed = String(process.env.VOICE_HELPER_TOKENS || '').split(/[\s,]+/).filter(Boolean);
  // The same token twice is the same bot twice, and one bot can only be in one
  // voice channel per server: sending "the other helper" somewhere pulled it
  // out of the channel it was talking in, mid sentence.
  const tokens = [...new Set(listed)];
  if (tokens.length < listed.length) {
    console.warn(`[CyberCom] VOICE_HELPER_TOKENS lists the same token ${listed.length - tokens.length} extra time(s). Each bot is used once; put a different bot's token there to get another helper.`);
  }
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
      // Two different tokens for one bot: the same problem as a repeated token.
      const twin = helpers.find((o) => o !== helper && o.ready && o.client.user?.id === client.user.id);
      if (twin) {
        console.warn(`[CyberCom] Helper ${helper.index} is the same bot as helper ${twin.index} (${client.user.tag}), so it is not used. Put a different bot's token in VOICE_HELPER_TOKENS.`);
        helpers = helpers.filter((o) => o !== helper);
        Promise.resolve(client.destroy()).catch(() => {});
        return;
      }
      helper.ready = true;
      console.log(`[CyberCom] Helper ${helper.index} ready as ${client.user.tag} in ${client.guilds.cache.size} server(s)`);
    });
    client.on('error', (err) => console.error(`[CyberCom] Helper ${helper.index} error:`, err.message));
    return helper;
  });
  // One after another, a moment apart: 16 accounts connecting at the same
  // instant is the kind of burst Discord's gateway rate limits.
  for (const h of helpers) {
    await h.client.login(h.token)
      .catch((err) => console.error(`[CyberCom] Helper ${h.index} could not log in:`, err.message))
      .finally(() => { delete h.token; });
    await new Promise((r) => setTimeout(r, 750));
  }
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
