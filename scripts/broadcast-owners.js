/**
 * One off announcement to the owner of every server the bot is in.
 *
 * This messages real people who did not ask to be messaged today, so it is built
 * to be hard to misfire:
 *
 *   - dry run by default. It prints exactly who would be messaged and stops.
 *     Sending needs --send typed on purpose.
 *   - the operator is always first, so the first thing anyone sees is what you
 *     see, and you can stop before it reaches anybody else.
 *   - one message a minute. Discord will rate limit a burst of DMs, and a
 *     hundred at once looks like exactly what it would be.
 *   - it records who it reached in broadcast-sent.json as it goes, so running it
 *     twice does not message anyone twice, and a crash halfway resumes rather
 *     than restarting.
 *   - closed DMs are counted, not treated as errors. It is a privacy setting.
 *
 * Usage:
 *   node scripts/broadcast-owners.js                 dry run, lists recipients
 *   node scripts/broadcast-owners.js --me            send to the operator only
 *   node scripts/broadcast-owners.js --send          send to everybody
 *   node scripts/broadcast-owners.js --send --limit 5   send to the first five
 */
import { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const SEND = process.argv.includes('--send');
const ME_ONLY = process.argv.includes('--me');
const LIMIT = (() => {
  const i = process.argv.indexOf('--limit');
  return i > -1 ? Number(process.argv[i + 1]) : Infinity;
})();

/** Between messages. Discord rate limits DMs hard, and this is not urgent. */
const GAP_MS = 60_000;

const LEDGER = 'broadcast-sent.json';

/** Your own Discord user id, so the first send is always to you. */
const OPERATOR_ID = process.env.BROADCAST_OPERATOR_ID || process.env.OWNER_ID || null;

// ── The message ────────────────────────────────────────────────────────────
function buildMessage(guildName) {
  const embed = new EmbedBuilder()
    .setColor('#2d2d2d')
    .setTitle('Some things worth knowing about RolePlayManager')
    .setDescription(
      'Hi, I run RolePlayManager. You have it in **' + guildName + '**, so I wanted to let '
      + 'you know about a few things that are new.\n\n'

      + '**There is a web dashboard**\n'
      + 'You can set the whole bot up in a browser instead of working through '
      + 'commands. Every feature, every setting, in one place.\n'
      + 'roleplaymanager.xyz/dashboard\n\n'

      + '**There is now a full CAD on the web too**\n'
      + 'Your members sign in with Discord and get their characters, vehicles, '
      + '911 calls and fines. Officers get a live call queue, plate and name '
      + 'lookups, tickets and BOLOs. It uses the same records the bot already '
      + 'has, so nothing needs moving over.\n'
      + 'roleplaymanager.xyz/cad\n\n'

      + '**911 calls are now read out in voice, free**\n'
      + 'If you set up a patrol channel, the bot joins when a 911 comes in, '
      + 'announces it, and leaves. That works on every server now, Premium or not.\n\n'

      + '**Premium has a 7 day free trial**\n'
      + 'No voting, no card. Run `/activatetrial` in your server and you get the '
      + 'AI voice dispatcher, applications and the priority tracker for a week.\n\n'

      + 'That is everything. If something is broken or you want something added, '
      + 'the support server is the fastest way to reach me.'
    )
    .setFooter({ text: 'RPM • You can stop these in Discord privacy settings, or just ask' });

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel('Dashboard').setStyle(ButtonStyle.Link)
      .setURL('https://roleplaymanager.xyz/dashboard'),
    new ButtonBuilder().setLabel('Web CAD').setStyle(ButtonStyle.Link)
      .setURL('https://roleplaymanager.xyz/cad'),
    new ButtonBuilder().setLabel('Support').setStyle(ButtonStyle.Link)
      .setURL('https://discord.gg/cSdhfGPeV2')
  );

  return { embeds: [embed], components: [buttons] };
}

// ── Who has already been reached ───────────────────────────────────────────
function loadLedger() {
  if (!existsSync(LEDGER)) return { sent: [], failed: [] };
  try { return JSON.parse(readFileSync(LEDGER, 'utf8')); }
  catch { return { sent: [], failed: [] }; }
}

function saveLedger(ledger) {
  writeFileSync(LEDGER, JSON.stringify(ledger, null, 2));
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Run ────────────────────────────────────────────────────────────────────
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('clientReady', async () => {
  console.log('Signed in as ' + client.user.tag);
  console.log('Servers: ' + client.guilds.cache.size);
  console.log('');

  const ledger = loadLedger();
  const already = new Set(ledger.sent.map((r) => r.userId));

  // One entry per owner, not per server. Somebody running four servers should
  // get one message, not four.
  const owners = new Map();
  for (const guild of client.guilds.cache.values()) {
    let owner;
    try { owner = await guild.fetchOwner(); }
    catch { console.log('  could not resolve the owner of "' + guild.name + '"'); continue; }

    if (!owners.has(owner.id)) {
      owners.set(owner.id, { owner, guildName: guild.name, guilds: 1 });
    } else {
      owners.get(owner.id).guilds++;
    }
  }

  let targets = [...owners.values()];

  // The operator goes first, always, so nothing reaches anyone else before it
  // has reached you.
  if (OPERATOR_ID) {
    targets.sort((a, b) => (b.owner.id === OPERATOR_ID) - (a.owner.id === OPERATOR_ID));
  } else if (!ME_ONLY) {
    console.log('BROADCAST_OPERATOR_ID is not set, so the first message will not be to you.');
    console.log('Set it and re-run if you want to see this land in your own DMs first.');
    console.log('');
  }

  if (ME_ONLY) {
    if (!OPERATOR_ID) { console.error('--me needs BROADCAST_OPERATOR_ID set.'); process.exit(1); }
    targets = targets.filter((t) => t.owner.id === OPERATOR_ID);
    if (!targets.length) {
      console.error('You do not own any server the bot is in, so --me has nobody to send to.');
      process.exit(1);
    }
  }

  const pending = targets.filter((t) => !already.has(t.owner.id)).slice(0, LIMIT);
  const skipped = targets.length - targets.filter((t) => !already.has(t.owner.id)).length;

  console.log('Distinct owners      : ' + targets.length);
  console.log('Already messaged     : ' + skipped);
  console.log('Would message now    : ' + pending.length);
  console.log('One message every    : ' + (GAP_MS / 1000) + 's');
  console.log('Estimated time       : ' + Math.round((pending.length * GAP_MS) / 60000) + ' minutes');
  console.log('');

  if (!SEND && !ME_ONLY) {
    console.log('DRY RUN. Nobody has been messaged.');
    for (const t of pending.slice(0, 20)) {
      console.log('  ' + t.owner.user.tag + '  (' + t.guildName
        + (t.guilds > 1 ? ' and ' + (t.guilds - 1) + ' more' : '') + ')');
    }
    if (pending.length > 20) console.log('  ... and ' + (pending.length - 20) + ' more');
    console.log('');
    console.log('Run with --me to send only to yourself, or --send to send to everybody.');
    await client.destroy();
    process.exit(0);
  }

  let sent = 0, blocked = 0, failed = 0;

  for (let i = 0; i < pending.length; i++) {
    const t = pending[i];
    const label = t.owner.user.tag + ' (' + t.guildName + ')';

    try {
      await t.owner.send(buildMessage(t.guildName));
      ledger.sent.push({ userId: t.owner.id, tag: t.owner.user.tag, at: new Date().toISOString() });
      sent++;
      console.log('[' + (i + 1) + '/' + pending.length + '] sent to ' + label);
    } catch (err) {
      if (err.code === 50007) {
        blocked++;
        console.log('[' + (i + 1) + '/' + pending.length + '] DMs closed: ' + label);
      } else {
        failed++;
        console.log('[' + (i + 1) + '/' + pending.length + '] FAILED ' + label + ': ' + err.message);
      }
      ledger.failed.push({ userId: t.owner.id, tag: t.owner.user.tag, reason: err.code || err.message });
    }

    // Written every time, so stopping this at any point loses nothing.
    saveLedger(ledger);

    if (i < pending.length - 1) await wait(GAP_MS);
  }

  console.log('');
  console.log('Sent    : ' + sent);
  console.log('DMs off : ' + blocked);
  console.log('Failed  : ' + failed);
  console.log('Ledger  : ' + LEDGER);

  await client.destroy();
  process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
