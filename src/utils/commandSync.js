import { createHash } from 'node:crypto';
import { REST, Routes } from 'discord.js';
import CommandSync from '../models/CommandSync.js';

/**
 * Slash commands for every server, sent only where they are missing or out
 * of date.
 *
 * Every start used to send all the commands to every server, one server at a
 * time, before voice dispatch and RPM CyberCom could start: about two minutes
 * of downtime per deploy, even when no command had changed. Now a hash of the
 * definitions says whether they changed; servers that already have the
 * current set are skipped, the rest go five at a time, and the bot starts
 * without waiting for any of it. Once a week every server gets them anyway,
 * in case a server lost them some other way.
 */

const AT_ONCE = 5;
const FULL_SYNC_DAYS = 7;

/** Run fn over items, at most `limit` at a time. */
export async function eachLimit(items, limit, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]);
  }));
}

export const commandDataOf = (client) => Array.from(client.commands.values()).map((c) => c.data.toJSON());
export const hashOf = (commandData) => createHash('sha256').update(JSON.stringify(commandData)).digest('hex');

/** A server that just got the current commands (a new server joining). */
export async function markSynced(guildId, commandData) {
  await CommandSync.updateOne({ key: 'commands', hash: hashOf(commandData) }, { $addToSet: { guildIds: guildId } }).catch(() => {});
}

export async function syncCommands(client, { rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN) } = {}) {
  const commandData = commandDataOf(client);
  const hash = hashOf(commandData);

  try {
    const existingGlobal = await rest.get(Routes.applicationCommands(client.user.id));
    if (existingGlobal.length > 0) {
      console.log(`[CLEAR] Found ${existingGlobal.length} global command(s) to clear: ${existingGlobal.map((c) => c.name).join(', ')}`);
      await rest.put(Routes.applicationCommands(client.user.id), { body: [] });
      console.log('[DONE] Global commands cleared');
    } else {
      console.log('[OK] No global commands found - nothing to clear');
    }
  } catch (e) {
    console.error('[WARN] Could not clear global commands:', e.message);
  }

  const state = await CommandSync.findOne({ key: 'commands' }).lean().catch(() => null);
  const current = state && state.hash === hash && state.fullSyncAt
    && Date.now() - new Date(state.fullSyncAt).getTime() < FULL_SYNC_DAYS * 86400000;
  const have = new Set(current ? state.guildIds : []);
  const todo = [...client.guilds.cache.values()].filter((g) => !have.has(g.id));
  const total = client.guilds.cache.size;

  console.log('');
  console.log('[STATS] COMMAND SYNC DETAILS:');
  console.log(`  Total servers: ${total}`);
  console.log(`  Commands: ${commandData.length}${current ? ' (unchanged since the last start)' : state && state.hash === hash ? ' (weekly resend)' : ' (changed, sending to every server)'}`);
  console.log(`  Servers to send them to: ${todo.length}${todo.length < total ? `, ${total - todo.length} already have them` : ''}`);
  console.log('');

  let ok = 0;
  let failed = 0;
  let n = 0;
  const done = [];
  await eachLimit(todo, AT_ONCE, async (guild) => {
    const i = ++n;
    console.log(`[${i}/${todo.length}] [PROC] Processing: "${guild.name}" (ID: ${guild.id}, Members: ${guild.memberCount})`);
    try {
      const startTime = Date.now();
      await rest.put(Routes.applicationGuildCommands(client.user.id, guild.id), { body: commandData });
      ok++;
      done.push(guild.id);
      console.log(`  [OK] ${commandData.length} commands registered in ${Date.now() - startTime}ms`);
    } catch (error) {
      failed++;
      console.log(`  [FAIL] ${guild.name} (${guild.id}) - ${error.message}`);
    }
  });

  // A server that failed is left out, so the next start tries it again.
  await CommandSync.updateOne(
    { key: 'commands' },
    current
      ? { $addToSet: { guildIds: { $each: done } } }
      : { $set: { hash, guildIds: done, fullSyncAt: new Date() } },
    { upsert: true },
  ).catch((err) => console.error('[SYNC] Could not save which servers have the commands:', err.message));

  console.log('');
  console.log('============================================================');
  console.log('[DONE] Command sync completed');
  console.log('[STATS] SYNC SUMMARY:');
  console.log(`  Sent: ${ok}/${todo.length}${todo.length < total ? ` (${total - todo.length} already up to date)` : ''}`);
  console.log(`  Failed: ${failed}/${todo.length}`);
  console.log('============================================================');
  console.log('');
  return { sent: ok, failed, skipped: total - todo.length };
}
