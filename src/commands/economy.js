import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import EconomyConfig from '../models/EconomyConfig.js';
import EconomyBalance from '../models/EconomyBalance.js';
import EconomyStore from '../models/EconomyStore.js';
import EconomyInventory from '../models/EconomyInventory.js';
import { errorEmbed, successEmbed } from '../utils/embedBuilder.js';

export const data = new SlashCommandBuilder()
  .setName('economy')
  .setDescription('Economy commands')
  // ── Balance & Bank ──────────────────────────────────────────────────────────
  .addSubcommand(sub =>
    sub.setName('balance')
      .setDescription('Check your or another user\'s balance')
      .addUserOption(o => o.setName('user').setDescription('User to check (defaults to you)'))
  )
  .addSubcommand(sub =>
    sub.setName('leaderboard')
      .setDescription('View the top 10 richest members in this server')
  )
  .addSubcommand(sub =>
    sub.setName('deposit')
      .setDescription('Deposit cash into your bank')
      .addStringOption(o => o.setName('amount').setDescription('Amount to deposit (or "all")').setRequired(true))
  )
  .addSubcommand(sub =>
    sub.setName('withdraw')
      .setDescription('Withdraw cash from your bank')
      .addStringOption(o => o.setName('amount').setDescription('Amount to withdraw (or "all")').setRequired(true))
  )
  .addSubcommand(sub =>
    sub.setName('give')
      .setDescription('Give cash to another member')
      .addUserOption(o => o.setName('user').setDescription('Recipient').setRequired(true))
      .addIntegerOption(o => o.setName('amount').setDescription('Amount to give').setRequired(true).setMinValue(1))
  )
  // ── Earn ────────────────────────────────────────────────────────────────────
  .addSubcommand(sub =>
    sub.setName('work')
      .setDescription('Work to earn money')
  )
  .addSubcommand(sub =>
    sub.setName('crime')
      .setDescription('Commit a crime to earn money (risky)')
  )
  .addSubcommand(sub =>
    sub.setName('rob')
      .setDescription('Attempt to rob another user')
      .addUserOption(o => o.setName('user').setDescription('User to rob').setRequired(true))
  )
  .addSubcommand(sub =>
    sub.setName('income')
      .setDescription('Collect your role-based income')
  )
  // ── Store & Inventory ───────────────────────────────────────────────────────
  .addSubcommand(sub =>
    sub.setName('store')
      .setDescription('View the server store')
  )
  .addSubcommand(sub =>
    sub.setName('inventory')
      .setDescription('View your or another user\'s inventory')
      .addUserOption(o => o.setName('user').setDescription('User to check (defaults to you)'))
  )
  .addSubcommand(sub =>
    sub.setName('buy')
      .setDescription('Buy an item from the store')
      .addStringOption(o => o.setName('item').setDescription('Item name').setRequired(true))
      .addIntegerOption(o => o.setName('quantity').setDescription('How many to buy').setMinValue(1))
  )
  .addSubcommand(sub =>
    sub.setName('sell')
      .setDescription('Sell an item from your inventory (50% value)')
      .addStringOption(o => o.setName('item').setDescription('Item name').setRequired(true))
      .addIntegerOption(o => o.setName('quantity').setDescription('How many to sell').setMinValue(1))
  )
  .addSubcommand(sub =>
    sub.setName('use')
      .setDescription('Use an item from your inventory')
      .addStringOption(o => o.setName('item').setDescription('Item name').setRequired(true))
  )
  .addSubcommand(sub =>
    sub.setName('giveitems')
      .setDescription('Give an item to another user')
      .addUserOption(o => o.setName('user').setDescription('Recipient').setRequired(true))
      .addStringOption(o => o.setName('item').setDescription('Item name').setRequired(true))
      .addIntegerOption(o => o.setName('quantity').setDescription('How many to give').setMinValue(1))
  )
  // ── Gambling ────────────────────────────────────────────────────────────────
  .addSubcommand(sub =>
    sub.setName('blackjack')
      .setDescription('Play a hand of blackjack')
      .addIntegerOption(o => o.setName('bet').setDescription('Amount to bet').setRequired(true).setMinValue(1))
  )
  .addSubcommand(sub =>
    sub.setName('roulette')
      .setDescription('Spin the roulette wheel')
      .addIntegerOption(o => o.setName('bet').setDescription('Amount to bet').setRequired(true).setMinValue(1))
      .addStringOption(o =>
        o.setName('choice')
          .setDescription('What to bet on')
          .setRequired(true)
          .addChoices(
            { name: 'Red (2x)', value: 'red' },
            { name: 'Black (2x)', value: 'black' },
            { name: 'Green (14x)', value: 'green' },
          )
      )
  )
  .addSubcommand(sub =>
    sub.setName('slots')
      .setDescription('Pull the slot machine')
      .addIntegerOption(o => o.setName('bet').setDescription('Amount to bet').setRequired(true).setMinValue(1))
  )
  .addSubcommand(sub =>
    sub.setName('roll')
      .setDescription('Roll a dice against the bot — higher wins')
      .addIntegerOption(o => o.setName('bet').setDescription('Amount to bet').setRequired(true).setMinValue(1))
  )
  .addSubcommand(sub =>
    sub.setName('russianroulette')
      .setDescription('1 in 6 chance of losing all your cash')
      .addIntegerOption(o => o.setName('bet').setDescription('Amount to bet (win 1.5x on survival)').setRequired(true).setMinValue(1))
  )
  .addSubcommand(sub =>
    sub.setName('cockfight')
      .setDescription('Enter your rooster in a fight — 50/50 for 1.8x')
      .addIntegerOption(o => o.setName('bet').setDescription('Amount to bet').setRequired(true).setMinValue(1))
  );

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getConfig(guildId) {
  let config = await EconomyConfig.findOne({ guildId });
  if (!config) config = new EconomyConfig({ guildId });
  return config;
}

async function getBalance(guildId, userId, startingBalance) {
  let bal = await EconomyBalance.findOne({ guildId, userId });
  if (!bal) {
    bal = new EconomyBalance({ guildId, userId, cash: startingBalance, bank: 0 });
    await bal.save();
  }
  return bal;
}

function fmt(num) {
  return Number(num).toLocaleString();
}

function cooldownRemaining(date, minutes) {
  if (!date) return 0;
  const diff = date.getTime() + minutes * 60 * 1000 - Date.now();
  return diff > 0 ? diff : 0;
}

function formatMs(ms) {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function hasPermission(member, allowedRoles) {
  if (!allowedRoles || allowedRoles.length === 0) return true;
  return member.roles.cache.some(r => allowedRoles.includes(r.id));
}

async function logEconomy(guild, config, message) {
  if (!config.logChannelId) return;
  try {
    const ch = guild.channels.cache.get(config.logChannelId);
    if (!ch?.isTextBased()) return;
    await ch.send({ embeds: [new EmbedBuilder().setColor(0x2d2d2d).setTitle('Economy Log').setDescription(message).setTimestamp().setFooter({ text: 'RPM' })] });
  } catch {}
}

// ─── Blackjack engine ────────────────────────────────────────────────────────

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function newDeck() {
  const deck = [];
  for (const s of SUITS) for (const r of RANKS) deck.push({ r, s });
  return deck.sort(() => Math.random() - 0.5);
}

function cardValue(card) {
  if (['J', 'Q', 'K'].includes(card.r)) return 10;
  if (card.r === 'A') return 11;
  return parseInt(card.r);
}

function handTotal(hand) {
  let total = hand.reduce((s, c) => s + cardValue(c), 0);
  let aces = hand.filter(c => c.r === 'A').length;
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

function handStr(hand) {
  return hand.map(c => `\`${c.r}${c.s}\``).join(' ');
}

// ─── Slots engine ─────────────────────────────────────────────────────────────

const SLOT_SYMBOLS = ['🍒', '🍋', '🍊', '🍇', '⭐', '💎'];
const SLOT_WEIGHTS = [30, 25, 20, 15, 7, 3]; // out of 100

function spinSlot() {
  const r = Math.random() * 100;
  let acc = 0;
  for (let i = 0; i < SLOT_SYMBOLS.length; i++) {
    acc += SLOT_WEIGHTS[i];
    if (r < acc) return SLOT_SYMBOLS[i];
  }
  return SLOT_SYMBOLS[0];
}

function slotMultiplier(reels) {
  const [a, b, c] = reels;
  if (a === b && b === c) {
    if (a === '💎') return 10;
    if (a === '⭐') return 5;
    return 3;
  }
  if (a === b || b === c || a === c) return 1.5;
  return 0;
}

// ─── Execute ─────────────────────────────────────────────────────────────────

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId;
  const userId = interaction.user.id;

  try {
    const config = await getConfig(guildId);

    if (!config.enabled) {
      return interaction.reply({ embeds: [errorEmbed('The economy system is not enabled on this server.')], flags: 64 });
    }

    const bal = await getBalance(guildId, userId, config.startingBalance);
    const sym = config.currencySymbol;

    // ── balance ────────────────────────────────────────────────────────────────
    if (sub === 'balance') {
      const target = interaction.options.getUser('user') ?? interaction.user;
      const b = target.id === userId ? bal : await getBalance(guildId, target.id, config.startingBalance);
      const total = b.cash + b.bank;
      const embed = new EmbedBuilder()
        .setColor(0x2d2d2d)
        .setTitle(`${target.username}'s Balance`)
        .setDescription(`**Cash:** ${sym}${fmt(b.cash)}\n**Bank:** ${sym}${fmt(b.bank)}\n**Total:** ${sym}${fmt(total)}`)
        .setFooter({ text: 'RPM' });
      return interaction.reply({ embeds: [embed] });
    }

    // ── leaderboard ───────────────────────────────────────────────────────────
    if (sub === 'leaderboard') {
      const top = await EconomyBalance.find({ guildId }).sort({ $expr: { $add: ['$cash', '$bank'] } }).limit(20);
      const sorted = top.sort((a, b) => (b.cash + b.bank) - (a.cash + a.cash));
      const lines = [];
      let rank = 1;
      for (const entry of sorted.slice(0, 10)) {
        const total = entry.cash + entry.bank;
        lines.push(`**${rank}.** <@${entry.userId}> — ${sym}${fmt(total)}`);
        rank++;
      }
      const embed = new EmbedBuilder()
        .setColor(0x2d2d2d)
        .setTitle('Economy Leaderboard')
        .setDescription(lines.length > 0 ? lines.join('\n') : 'No data yet.')
        .setFooter({ text: 'RPM' });
      return interaction.reply({ embeds: [embed] });
    }

    // ── deposit ───────────────────────────────────────────────────────────────
    if (sub === 'deposit') {
      const raw = interaction.options.getString('amount');
      const amount = raw.toLowerCase() === 'all' ? bal.cash : parseInt(raw);
      if (isNaN(amount) || amount < 1) return interaction.reply({ embeds: [errorEmbed('Enter a valid amount or "all".')], flags: 64 });
      if (amount > bal.cash) return interaction.reply({ embeds: [errorEmbed(`You only have ${sym}${fmt(bal.cash)} in cash.`)], flags: 64 });
      bal.cash -= amount;
      bal.bank = Math.min(bal.bank + amount, config.maxBalance);
      await bal.save();
      return interaction.reply({ embeds: [successEmbed('Deposited', `${sym}${fmt(amount)} moved to your bank.\n**Cash:** ${sym}${fmt(bal.cash)}  **Bank:** ${sym}${fmt(bal.bank)}`)] });
    }

    // ── withdraw ──────────────────────────────────────────────────────────────
    if (sub === 'withdraw') {
      const raw = interaction.options.getString('amount');
      const amount = raw.toLowerCase() === 'all' ? bal.bank : parseInt(raw);
      if (isNaN(amount) || amount < 1) return interaction.reply({ embeds: [errorEmbed('Enter a valid amount or "all".')], flags: 64 });
      if (amount > bal.bank) return interaction.reply({ embeds: [errorEmbed(`You only have ${sym}${fmt(bal.bank)} in your bank.`)], flags: 64 });
      bal.bank -= amount;
      bal.cash = Math.min(bal.cash + amount, config.maxBalance);
      await bal.save();
      return interaction.reply({ embeds: [successEmbed('Withdrawn', `${sym}${fmt(amount)} moved to your cash.\n**Cash:** ${sym}${fmt(bal.cash)}  **Bank:** ${sym}${fmt(bal.bank)}`)] });
    }

    // ── give ──────────────────────────────────────────────────────────────────
    if (sub === 'give') {
      const target = interaction.options.getUser('user');
      const amount = interaction.options.getInteger('amount');
      if (target.id === userId) return interaction.reply({ embeds: [errorEmbed('You cannot give money to yourself.')], flags: 64 });
      if (target.bot) return interaction.reply({ embeds: [errorEmbed('You cannot give money to a bot.')], flags: 64 });
      if (bal.cash < amount) return interaction.reply({ embeds: [errorEmbed(`You only have ${sym}${fmt(bal.cash)} in cash.`)], flags: 64 });

      const targetBal = await getBalance(guildId, target.id, config.startingBalance);
      bal.cash -= amount;
      targetBal.cash = Math.min(targetBal.cash + amount, config.maxBalance);
      await Promise.all([bal.save(), targetBal.save()]);
      return interaction.reply({ embeds: [successEmbed('Money Given', `You gave ${sym}${fmt(amount)} to **${target.username}**.\n**Your Cash:** ${sym}${fmt(bal.cash)}`)] });
    }

    // ── work ──────────────────────────────────────────────────────────────────
    if (sub === 'work') {
      if (!config.work.enabled) return interaction.reply({ embeds: [errorEmbed('Work is disabled on this server.')], flags: 64 });
      if (!hasPermission(interaction.member, config.permissions.workRoles)) {
        return interaction.reply({ embeds: [errorEmbed('You do not have the required role to work.')], flags: 64 });
      }
      const remaining = cooldownRemaining(bal.workCooldown, config.work.cooldown);
      if (remaining > 0) return interaction.reply({ embeds: [errorEmbed(`You can work again in **${formatMs(remaining)}**.`)], flags: 64 });

      const pay = Math.floor(Math.random() * (config.work.maxPayout - config.work.minPayout + 1)) + config.work.minPayout;
      bal.cash = Math.min(bal.cash + pay, config.maxBalance);
      bal.workCooldown = new Date();
      await bal.save();

      const defaultReplies = [
        `You fixed some cars at the mechanic shop and earned ${sym}${fmt(pay)}.`,
        `You delivered packages across the city and earned ${sym}${fmt(pay)}.`,
        `You worked a shift at the gas station and earned ${sym}${fmt(pay)}.`,
        `You drove a taxi all night and earned ${sym}${fmt(pay)}.`,
        `You unloaded cargo at the docks and earned ${sym}${fmt(pay)}.`,
      ];
      const replies = config.work.customReplies.length > 0
        ? config.work.customReplies.map(r => r.replace('{amount}', `${sym}${fmt(pay)}`))
        : defaultReplies;
      const reply = replies[Math.floor(Math.random() * replies.length)];

      return interaction.reply({ embeds: [successEmbed('Work Complete', `${reply}\n-# Next work: ${formatMs(config.work.cooldown * 60 * 1000)}`)] });
    }

    // ── crime ─────────────────────────────────────────────────────────────────
    if (sub === 'crime') {
      if (!config.crime.enabled) return interaction.reply({ embeds: [errorEmbed('Crime is disabled on this server.')], flags: 64 });
      if (!hasPermission(interaction.member, config.permissions.crimeRoles)) {
        return interaction.reply({ embeds: [errorEmbed('You do not have the required role to commit crimes.')], flags: 64 });
      }
      const remaining = cooldownRemaining(bal.crimeCooldown, config.crime.cooldown);
      if (remaining > 0) return interaction.reply({ embeds: [errorEmbed(`You can commit a crime again in **${formatMs(remaining)}**.`)], flags: 64 });

      bal.crimeCooldown = new Date();
      const success = Math.random() * 100 < config.crime.successRate;

      if (success) {
        const pay = Math.floor(Math.random() * (config.crime.maxPayout - config.crime.minPayout + 1)) + config.crime.minPayout;
        bal.cash = Math.min(bal.cash + pay, config.maxBalance);
        await bal.save();

        const defaultReplies = [
          `You robbed a convenience store and got away with ${sym}${fmt(pay)}.`,
          `You hacked into a corporate account and siphoned ${sym}${fmt(pay)}.`,
          `You pickpocketed tourists on the strip and pocketed ${sym}${fmt(pay)}.`,
          `You boosted a car and sold it for ${sym}${fmt(pay)}.`,
        ];
        const replies = config.crime.customReplies.length > 0
          ? config.crime.customReplies.map(r => r.replace('{amount}', `${sym}${fmt(pay)}`))
          : defaultReplies;
        const reply = replies[Math.floor(Math.random() * replies.length)];
        return interaction.reply({ embeds: [successEmbed('Crime Successful', `${reply}\n-# Next crime: ${formatMs(config.crime.cooldown * 60 * 1000)}`)] });
      } else {
        const fine = Math.floor(config.crime.maxPayout * (config.crime.fineRate / 100));
        bal.cash = Math.max(0, bal.cash - fine);
        await bal.save();
        return interaction.reply({ embeds: [{ color: 0xf04747, title: 'Crime Failed', description: `You got caught and paid a fine of **${sym}${fmt(fine)}**.\n-# Next crime: ${formatMs(config.crime.cooldown * 60 * 1000)}`, footer: { text: 'RPM' } }] });
      }
    }

    // ── rob ───────────────────────────────────────────────────────────────────
    if (sub === 'rob') {
      if (!config.rob.enabled) return interaction.reply({ embeds: [errorEmbed('Robbing is disabled on this server.')], flags: 64 });
      const target = interaction.options.getUser('user');
      if (target.id === userId) return interaction.reply({ embeds: [errorEmbed('You cannot rob yourself.')], flags: 64 });
      if (target.bot) return interaction.reply({ embeds: [errorEmbed('You cannot rob a bot.')], flags: 64 });

      const remaining = cooldownRemaining(bal.robCooldown, config.rob.cooldown);
      if (remaining > 0) return interaction.reply({ embeds: [errorEmbed(`You can rob again in **${formatMs(remaining)}**.`)], flags: 64 });

      const targetBal = await getBalance(guildId, target.id, config.startingBalance);
      if (targetBal.cash < 10) return interaction.reply({ embeds: [errorEmbed(`**${target.username}** doesn't have enough cash to rob.`)], flags: 64 });

      bal.robCooldown = new Date();
      const success = Math.random() * 100 < config.rob.successRate;

      if (success) {
        const stealAmount = Math.floor(targetBal.cash * (config.rob.maxStealPercent / 100) * Math.random());
        const actual = Math.max(1, stealAmount);
        targetBal.cash = Math.max(0, targetBal.cash - actual);
        bal.cash = Math.min(bal.cash + actual, config.maxBalance);
        await Promise.all([bal.save(), targetBal.save()]);
        return interaction.reply({ embeds: [successEmbed('Rob Successful', `You robbed **${target.username}** for **${sym}${fmt(actual)}**!\n**Your Cash:** ${sym}${fmt(bal.cash)}`)] });
      } else {
        const fine = Math.floor(targetBal.cash * 0.1);
        bal.cash = Math.max(0, bal.cash - fine);
        await bal.save();
        return interaction.reply({ embeds: [{ color: 0xf04747, title: 'Rob Failed', description: `You got caught trying to rob **${target.username}** and paid a fine of **${sym}${fmt(fine)}**.\n-# Next rob: ${formatMs(config.rob.cooldown * 60 * 1000)}`, footer: { text: 'RPM' } }] });
      }
    }

    // ── income ────────────────────────────────────────────────────────────────
    if (sub === 'income') {
      if (config.roleIncome.length === 0) {
        return interaction.reply({ embeds: [errorEmbed('No role income is configured on this server.')], flags: 64 });
      }

      const memberRoleIds = interaction.member.roles.cache.map(r => r.id);
      const eligible = config.roleIncome.filter(ri => memberRoleIds.includes(ri.roleId));

      if (eligible.length === 0) {
        return interaction.reply({ embeds: [errorEmbed('You do not have any roles with income configured.')], flags: 64 });
      }

      const incomeCooldowns = bal.incomeCooldowns || new Map();
      let totalEarned = 0;
      const results = [];

      for (const ri of eligible) {
        const lastCollected = incomeCooldowns.get(ri.roleId);
        const cooldownMs = ri.cooldown * 60 * 60 * 1000;
        if (lastCollected && Date.now() - lastCollected.getTime() < cooldownMs) {
          const remaining = cooldownMs - (Date.now() - lastCollected.getTime());
          results.push(`<@&${ri.roleId}>: ready in ${formatMs(remaining)}`);
        } else {
          totalEarned += ri.amount;
          incomeCooldowns.set(ri.roleId, new Date());
          results.push(`<@&${ri.roleId}>: collected **${sym}${fmt(ri.amount)}**`);
        }
      }

      if (totalEarned > 0) {
        bal.cash = Math.min(bal.cash + totalEarned, config.maxBalance);
        bal.incomeCooldowns = incomeCooldowns;
        bal.markModified('incomeCooldowns');
        await bal.save();
      }

      const desc = results.join('\n') + (totalEarned > 0 ? `\n\n**Total Collected:** ${sym}${fmt(totalEarned)}` : '');
      const embed = new EmbedBuilder()
        .setColor(totalEarned > 0 ? 0x43b581 : 0x2d2d2d)
        .setTitle('Role Income')
        .setDescription(desc)
        .setFooter({ text: 'RPM' });
      return interaction.reply({ embeds: [embed] });
    }

    // ── store ─────────────────────────────────────────────────────────────────
    if (sub === 'store') {
      const items = await EconomyStore.find({ guildId });
      if (items.length === 0) return interaction.reply({ embeds: [errorEmbed('The store has no items yet.')], flags: 64 });
      const desc = items.map((item, i) =>
        `**${i + 1}. ${item.name}** — ${sym}${fmt(item.price)}\n-# ${item.description}${item.usable ? ' *(usable)*' : ''}`
      ).join('\n\n');
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x2d2d2d).setTitle('Server Store').setDescription(desc).setFooter({ text: 'RPM' })] });
    }

    // ── inventory ─────────────────────────────────────────────────────────────
    if (sub === 'inventory') {
      const target = interaction.options.getUser('user') ?? interaction.user;
      const inv = await EconomyInventory.findOne({ guildId, userId: target.id });
      if (!inv || inv.items.length === 0) {
        return interaction.reply({ embeds: [errorEmbed(`${target.id === userId ? 'Your' : `**${target.username}'s**`} inventory is empty.`)], flags: 64 });
      }
      const desc = inv.items.map(i => `**${i.itemName}** x${i.quantity}`).join('\n');
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x2d2d2d).setTitle(`${target.username}'s Inventory`).setDescription(desc).setFooter({ text: 'RPM' })] });
    }

    // ── buy ───────────────────────────────────────────────────────────────────
    if (sub === 'buy') {
      const itemName = interaction.options.getString('item');
      const qty = interaction.options.getInteger('quantity') ?? 1;
      const item = await EconomyStore.findOne({ guildId, name: { $regex: new RegExp(`^${itemName}$`, 'i') } });
      if (!item) return interaction.reply({ embeds: [errorEmbed(`No item named **${itemName}** found in the store.`)], flags: 64 });

      const total = item.price * qty;
      if (bal.cash < total) return interaction.reply({ embeds: [errorEmbed(`You need ${sym}${fmt(total)} but only have ${sym}${fmt(bal.cash)}.`)], flags: 64 });

      bal.cash -= total;
      await bal.save();

      let inv = await EconomyInventory.findOne({ guildId, userId });
      if (!inv) inv = new EconomyInventory({ guildId, userId, items: [] });
      const existing = inv.items.find(i => i.itemName === item.name);
      if (existing) existing.quantity += qty;
      else inv.items.push({ itemName: item.name, quantity: qty });
      inv.markModified('items');
      await inv.save();

      return interaction.reply({ embeds: [successEmbed('Purchase Complete', `You bought **${item.name}** x${qty} for **${sym}${fmt(total)}**.\n**Remaining Cash:** ${sym}${fmt(bal.cash)}`)] });
    }

    // ── sell ──────────────────────────────────────────────────────────────────
    if (sub === 'sell') {
      const itemName = interaction.options.getString('item');
      const qty = interaction.options.getInteger('quantity') ?? 1;

      const inv = await EconomyInventory.findOne({ guildId, userId });
      const owned = inv?.items.find(i => i.itemName.toLowerCase() === itemName.toLowerCase());
      if (!owned || owned.quantity < qty) return interaction.reply({ embeds: [errorEmbed(`You don't have ${qty}x **${itemName}** in your inventory.`)], flags: 64 });

      const storeItem = await EconomyStore.findOne({ guildId, name: { $regex: new RegExp(`^${itemName}$`, 'i') } });
      const refund = storeItem ? Math.floor((storeItem.price * qty) * 0.5) : 0;

      owned.quantity -= qty;
      if (owned.quantity <= 0) inv.items = inv.items.filter(i => i.itemName.toLowerCase() !== itemName.toLowerCase());
      inv.markModified('items');
      await inv.save();

      if (refund > 0) {
        bal.cash = Math.min(bal.cash + refund, config.maxBalance);
        await bal.save();
      }

      return interaction.reply({ embeds: [successEmbed('Items Sold', `Sold **${itemName}** x${qty} for **${sym}${fmt(refund)}**.\n**Cash:** ${sym}${fmt(bal.cash)}`)] });
    }

    // ── use ───────────────────────────────────────────────────────────────────
    if (sub === 'use') {
      const itemName = interaction.options.getString('item');
      const inv = await EconomyInventory.findOne({ guildId, userId });
      const owned = inv?.items.find(i => i.itemName.toLowerCase() === itemName.toLowerCase());
      if (!owned || owned.quantity < 1) return interaction.reply({ embeds: [errorEmbed(`You don't have **${itemName}** in your inventory.`)], flags: 64 });

      const storeItem = await EconomyStore.findOne({ guildId, name: { $regex: new RegExp(`^${itemName}$`, 'i') } });
      if (!storeItem?.usable) return interaction.reply({ embeds: [errorEmbed(`**${itemName}** cannot be used.`)], flags: 64 });

      owned.quantity -= 1;
      if (owned.quantity <= 0) inv.items = inv.items.filter(i => i.itemName.toLowerCase() !== itemName.toLowerCase());
      inv.markModified('items');
      await inv.save();

      const effect = storeItem.useEffect || 'You used the item.';
      return interaction.reply({ embeds: [successEmbed(`Used: ${storeItem.name}`, effect)] });
    }

    // ── giveitems ─────────────────────────────────────────────────────────────
    if (sub === 'giveitems') {
      const target = interaction.options.getUser('user');
      const itemName = interaction.options.getString('item');
      const qty = interaction.options.getInteger('quantity') ?? 1;
      if (target.id === userId) return interaction.reply({ embeds: [errorEmbed('You cannot give items to yourself.')], flags: 64 });

      const inv = await EconomyInventory.findOne({ guildId, userId });
      const owned = inv?.items.find(i => i.itemName.toLowerCase() === itemName.toLowerCase());
      if (!owned || owned.quantity < qty) return interaction.reply({ embeds: [errorEmbed(`You don't have ${qty}x **${itemName}**.`)], flags: 64 });

      owned.quantity -= qty;
      if (owned.quantity <= 0) inv.items = inv.items.filter(i => i.itemName.toLowerCase() !== itemName.toLowerCase());
      inv.markModified('items');
      await inv.save();

      let targetInv = await EconomyInventory.findOne({ guildId, userId: target.id });
      if (!targetInv) targetInv = new EconomyInventory({ guildId, userId: target.id, items: [] });
      const targetOwned = targetInv.items.find(i => i.itemName === owned.itemName || i.itemName.toLowerCase() === itemName.toLowerCase());
      if (targetOwned) targetOwned.quantity += qty;
      else targetInv.items.push({ itemName: itemName, quantity: qty });
      targetInv.markModified('items');
      await targetInv.save();

      return interaction.reply({ embeds: [successEmbed('Items Given', `You gave **${itemName}** x${qty} to **${target.username}**.`)] });
    }

    // ─── Gambling guard ──────────────────────────────────────────────────────

    const gamblingCmds = ['blackjack', 'roulette', 'slots', 'roll', 'russianroulette', 'cockfight'];
    if (gamblingCmds.includes(sub)) {
      if (!config.gambling.enabled) return interaction.reply({ embeds: [errorEmbed('Gambling is disabled on this server.')], flags: 64 });
      if (!hasPermission(interaction.member, config.permissions.gamblingRoles)) {
        return interaction.reply({ embeds: [errorEmbed('You do not have the required role to gamble.')], flags: 64 });
      }

      const bet = interaction.options.getInteger('bet');
      if (bet < config.gambling.minBet) return interaction.reply({ embeds: [errorEmbed(`Minimum bet is ${sym}${fmt(config.gambling.minBet)}.`)], flags: 64 });
      if (bet > config.gambling.maxBet) return interaction.reply({ embeds: [errorEmbed(`Maximum bet is ${sym}${fmt(config.gambling.maxBet)}.`)], flags: 64 });
      if (bet > bal.cash) return interaction.reply({ embeds: [errorEmbed(`You only have ${sym}${fmt(bal.cash)} in cash.`)], flags: 64 });

      const cdRemaining = cooldownRemaining(bal.gamblingCooldown, config.gambling.cooldown);
      if (cdRemaining > 0) return interaction.reply({ embeds: [errorEmbed(`You can gamble again in **${formatMs(cdRemaining)}**.`)], flags: 64 });
    }

    // ── blackjack ─────────────────────────────────────────────────────────────
    if (sub === 'blackjack') {
      const bet = interaction.options.getInteger('bet');
      const deck = newDeck();
      const player = [deck.pop(), deck.pop()];
      const dealer = [deck.pop(), deck.pop()];

      let playerTotal = handTotal(player);
      let dealerTotal = handTotal(dealer);

      // Dealer draws to 17
      while (dealerTotal < 17) {
        dealer.push(deck.pop());
        dealerTotal = handTotal(dealer);
      }

      const playerBust = playerTotal > 21;
      const dealerBust = dealerTotal > 21;
      let result, winAmount;

      if (playerBust) {
        result = 'lose';
      } else if (dealerBust || playerTotal > dealerTotal) {
        result = playerTotal === 21 && player.length === 2 ? 'blackjack' : 'win';
      } else if (playerTotal === dealerTotal) {
        result = 'push';
      } else {
        result = 'lose';
      }

      if (result === 'blackjack') {
        winAmount = Math.floor(bet * 1.5);
        bal.cash = Math.min(bal.cash + winAmount, config.maxBalance);
      } else if (result === 'win') {
        winAmount = bet;
        bal.cash = Math.min(bal.cash + winAmount, config.maxBalance);
      } else if (result === 'lose') {
        winAmount = -bet;
        bal.cash = Math.max(0, bal.cash - bet);
      } else {
        winAmount = 0;
      }

      bal.gamblingCooldown = new Date();
      await bal.save();

      const resultText = {
        blackjack: `Blackjack! You win **${sym}${fmt(winAmount)}**!`,
        win: `You win **${sym}${fmt(winAmount)}**!`,
        lose: `You lose **${sym}${fmt(bet)}**.`,
        push: `Push — your bet is returned.`,
      }[result];

      const color = result === 'lose' ? 0xf04747 : result === 'push' ? 0xfaa61a : 0x43b581;
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(color)
          .setTitle('Blackjack')
          .setDescription(
            `**Your hand:** ${handStr(player)} — **${playerTotal}**\n` +
            `**Dealer hand:** ${handStr(dealer)} — **${dealerTotal}**\n\n` +
            `${resultText}\n**Cash:** ${sym}${fmt(bal.cash)}`
          ).setFooter({ text: 'RPM' })],
      });
    }

    // ── roulette ──────────────────────────────────────────────────────────────
    if (sub === 'roulette') {
      const bet = interaction.options.getInteger('bet');
      const choice = interaction.options.getString('choice');

      const roll = Math.floor(Math.random() * 38);
      let landed;
      if (roll === 0) landed = 'green';
      else if (roll <= 18) landed = 'red';
      else landed = 'black';

      const multipliers = { red: 2, black: 2, green: 14 };
      const won = landed === choice;
      const mult = multipliers[choice];

      let change;
      if (won) {
        change = bet * (mult - 1);
        bal.cash = Math.min(bal.cash + change, config.maxBalance);
      } else {
        change = -bet;
        bal.cash = Math.max(0, bal.cash - bet);
      }
      bal.gamblingCooldown = new Date();
      await bal.save();

      const color = won ? 0x43b581 : 0xf04747;
      const landedLabel = landed === 'green' ? '🟢 Green' : landed === 'red' ? '🔴 Red' : '⚫ Black';
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(color)
          .setTitle('Roulette')
          .setDescription(
            `The wheel landed on **${landedLabel}**.\n\n` +
            (won ? `You win **${sym}${fmt(change)}**!` : `You lose **${sym}${fmt(bet)}**.`) +
            `\n**Cash:** ${sym}${fmt(bal.cash)}`
          ).setFooter({ text: 'RPM' })],
      });
    }

    // ── slots ─────────────────────────────────────────────────────────────────
    if (sub === 'slots') {
      const bet = interaction.options.getInteger('bet');
      const reels = [spinSlot(), spinSlot(), spinSlot()];
      const mult = slotMultiplier(reels);

      let change;
      if (mult > 0) {
        change = Math.floor(bet * mult);
        bal.cash = Math.min(bal.cash + change, config.maxBalance);
      } else {
        change = -bet;
        bal.cash = Math.max(0, bal.cash - bet);
      }
      bal.gamblingCooldown = new Date();
      await bal.save();

      const color = mult > 0 ? 0x43b581 : 0xf04747;
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(color)
          .setTitle('Slot Machine')
          .setDescription(
            `[ ${reels.join(' | ')} ]\n\n` +
            (mult > 0 ? `**${mult}x** — You win **${sym}${fmt(change)}**!` : `No match — you lose **${sym}${fmt(bet)}**.`) +
            `\n**Cash:** ${sym}${fmt(bal.cash)}`
          ).setFooter({ text: 'RPM' })],
      });
    }

    // ── roll ──────────────────────────────────────────────────────────────────
    if (sub === 'roll') {
      const bet = interaction.options.getInteger('bet');
      const playerRoll = Math.floor(Math.random() * 6) + 1;
      const botRoll = Math.floor(Math.random() * 6) + 1;

      let change;
      let result;
      if (playerRoll > botRoll) {
        change = bet;
        result = 'win';
        bal.cash = Math.min(bal.cash + bet, config.maxBalance);
      } else if (playerRoll < botRoll) {
        change = -bet;
        result = 'lose';
        bal.cash = Math.max(0, bal.cash - bet);
      } else {
        change = 0;
        result = 'tie';
      }
      bal.gamblingCooldown = new Date();
      await bal.save();

      const color = result === 'win' ? 0x43b581 : result === 'lose' ? 0xf04747 : 0xfaa61a;
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(color)
          .setTitle('Dice Roll')
          .setDescription(
            `**You rolled:** ${playerRoll}  **Bot rolled:** ${botRoll}\n\n` +
            (result === 'win' ? `You win **${sym}${fmt(change)}**!` : result === 'lose' ? `You lose **${sym}${fmt(bet)}**.` : `Tie — bet returned.`) +
            `\n**Cash:** ${sym}${fmt(bal.cash)}`
          ).setFooter({ text: 'RPM' })],
      });
    }

    // ── russianroulette ───────────────────────────────────────────────────────
    if (sub === 'russianroulette') {
      const bet = interaction.options.getInteger('bet');
      const chamber = Math.floor(Math.random() * 6);

      if (chamber === 0) {
        const lost = bal.cash;
        bal.cash = 0;
        bal.gamblingCooldown = new Date();
        await bal.save();
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor(0xf04747)
            .setTitle('Russian Roulette')
            .setDescription(`*click* **BANG**\n\nYou lost everything — **${sym}${fmt(lost)}** gone.\n**Cash:** ${sym}0`)
            .setFooter({ text: 'RPM' })],
        });
      } else {
        const win = Math.floor(bet * 0.5);
        bal.cash = Math.min(bal.cash + win, config.maxBalance);
        bal.gamblingCooldown = new Date();
        await bal.save();
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor(0x43b581)
            .setTitle('Russian Roulette')
            .setDescription(`*click* You survived.\n\nYou win **${sym}${fmt(win)}**.\n**Cash:** ${sym}${fmt(bal.cash)}`)
            .setFooter({ text: 'RPM' })],
        });
      }
    }

    // ── cockfight ─────────────────────────────────────────────────────────────
    if (sub === 'cockfight') {
      const bet = interaction.options.getInteger('bet');
      const won = Math.random() < 0.5;
      const roosters = ['Rocky', 'Titan', 'Thunder', 'Blaze', 'Shadow', 'Goliath'];
      const yours = roosters[Math.floor(Math.random() * roosters.length)];
      let opponent;
      do { opponent = roosters[Math.floor(Math.random() * roosters.length)]; } while (opponent === yours);

      let change;
      if (won) {
        change = Math.floor(bet * 0.8);
        bal.cash = Math.min(bal.cash + change, config.maxBalance);
      } else {
        change = -bet;
        bal.cash = Math.max(0, bal.cash - bet);
      }
      bal.gamblingCooldown = new Date();
      await bal.save();

      const color = won ? 0x43b581 : 0xf04747;
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(color)
          .setTitle('Cock Fight')
          .setDescription(
            `**${yours}** vs **${opponent}**\n\n` +
            (won ? `**${yours}** wins! You earn **${sym}${fmt(change)}**.` : `**${opponent}** wins. You lose **${sym}${fmt(bet)}**.`) +
            `\n**Cash:** ${sym}${fmt(bal.cash)}`
          ).setFooter({ text: 'RPM' })],
      });
    }
  } catch (err) {
    console.error('[economy]', err);
    return interaction.reply({ embeds: [errorEmbed('An error occurred.')], flags: 64 });
  }
}
