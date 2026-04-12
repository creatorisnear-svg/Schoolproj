import {
  EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder,
  ButtonBuilder, ButtonStyle,
} from 'discord.js';
import EconomyConfig from '../models/EconomyConfig.js';
import EconomyBalance from '../models/EconomyBalance.js';
import EconomyStore from '../models/EconomyStore.js';
import EconomyInventory from '../models/EconomyInventory.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';
import { GTA_VEHICLES } from '../data/gtaVehicles.js';

function fmt(num) { return Number(num).toLocaleString(); }

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

function parseUserId(text) {
  const m = text?.trim().match(/^<@!?(\d+)>$/) || text?.trim().match(/^(\d+)$/);
  return m ? m[1] : null;
}

async function getConfig(guildId) {
  return EconomyConfig.findOne({ guildId });
}

async function getBalance(guildId, userId, startingBalance) {
  let bal = await EconomyBalance.findOne({ guildId, userId });
  if (!bal) {
    bal = new EconomyBalance({ guildId, userId, cash: startingBalance ?? 0, bank: 0 });
    await bal.save();
  }
  return bal;
}

async function getConfigOrFail(interaction) {
  const config = await getConfig(interaction.guildId);
  if (!config?.enabled) {
    await interaction.reply({ embeds: [errorEmbed('The economy system is not enabled on this server.')], flags: 64 });
    return null;
  }
  return config;
}

function buildShopSelectMenu(mergedItems, sym, query) {
  const filtered = query
    ? mergedItems.filter(i =>
        i.name.toLowerCase().includes(query.toLowerCase()) ||
        (i.category || '').toLowerCase().includes(query.toLowerCase())
      )
    : mergedItems;
  const opts = filtered.slice(0, 25).map(item => {
    const priceStr = item.price != null ? `${sym}${fmt(item.price)}` : 'No price set';
    return {
      label: `${item.name} — ${priceStr}`.slice(0, 100),
      value: `__item__${item.name}`,
      description: ((item.category ? `[${item.category}] ` : '') + (item.description || '')).slice(0, 100),
    };
  });
  if (!opts.length) return null;
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('economy_shop_browse_select')
      .setPlaceholder('Select an item to view details...')
      .addOptions(opts)
  );
}

function mergeShopItems(guildItems) {
  const guildNames = new Set(guildItems.map(i => i.name.toLowerCase()));
  const builtIns = GTA_VEHICLES
    .filter(v => !guildNames.has(v.name.toLowerCase()))
    .map(v => ({ name: v.name, price: null, description: v.description, category: v.category, isBuiltIn: true }));
  const guildFormatted = guildItems.map(i => ({
    name: i.name, price: i.price, description: i.description, category: 'Custom', isBuiltIn: false,
  }));
  return [...guildFormatted, ...builtIns];
}

// ─────────────────────────────────────────────────────────────────────────────
// BALANCE
// ─────────────────────────────────────────────────────────────────────────────
export async function runBalance(interaction) {
  const config = await getConfigOrFail(interaction);
  if (!config) return;
  const sym = config.currencySymbol;
  const bal = await getBalance(interaction.guildId, interaction.user.id, config.startingBalance);
  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(0x2d2d2d)
      .setTitle(`${interaction.user.username}'s Balance`)
      .setDescription(`**Cash:** ${sym}${fmt(bal.cash)}\n**Bank:** ${sym}${fmt(bal.bank)}\n**Total:** ${sym}${fmt(bal.cash + bal.bank)}`)
      .setFooter({ text: 'RPM' })],
    flags: 64,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// LEADERBOARD
// ─────────────────────────────────────────────────────────────────────────────
export async function runLeaderboard(interaction) {
  const config = await getConfigOrFail(interaction);
  if (!config) return;
  const sym = config.currencySymbol;
  const top = await EconomyBalance.find({ guildId: interaction.guildId }).limit(20);
  const sorted = top.sort((a, b) => (b.cash + b.bank) - (a.cash + a.bank));
  const lines = sorted.slice(0, 10).map((e, i) => `**${i + 1}.** <@${e.userId}> — ${sym}${fmt(e.cash + e.bank)}`);
  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(0x2d2d2d)
      .setTitle('Economy Leaderboard')
      .setDescription(lines.join('\n') || 'No data yet.')
      .setFooter({ text: 'RPM' })],
    flags: 64,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// DEPOSIT
// ─────────────────────────────────────────────────────────────────────────────
export async function runDeposit(interaction, rawAmount) {
  const config = await getConfigOrFail(interaction);
  if (!config) return;
  const sym = config.currencySymbol;
  const bal = await getBalance(interaction.guildId, interaction.user.id, config.startingBalance);
  const amount = rawAmount.toLowerCase() === 'all' ? bal.cash : parseInt(rawAmount);
  if (isNaN(amount) || amount < 1) return interaction.reply({ embeds: [errorEmbed('Enter a valid amount or "all".')], flags: 64 });
  if (amount > bal.cash) return interaction.reply({ embeds: [errorEmbed(`You only have ${sym}${fmt(bal.cash)} in cash.`)], flags: 64 });
  bal.cash -= amount;
  bal.bank = Math.min(bal.bank + amount, config.maxBalance);
  await bal.save();
  return interaction.reply({ embeds: [successEmbed('Deposited', `${sym}${fmt(amount)} moved to your bank.\n**Cash:** ${sym}${fmt(bal.cash)}  **Bank:** ${sym}${fmt(bal.bank)}`)], flags: 64 });
}

// ─────────────────────────────────────────────────────────────────────────────
// WITHDRAW
// ─────────────────────────────────────────────────────────────────────────────
export async function runWithdraw(interaction, rawAmount) {
  const config = await getConfigOrFail(interaction);
  if (!config) return;
  const sym = config.currencySymbol;
  const bal = await getBalance(interaction.guildId, interaction.user.id, config.startingBalance);
  const amount = rawAmount.toLowerCase() === 'all' ? bal.bank : parseInt(rawAmount);
  if (isNaN(amount) || amount < 1) return interaction.reply({ embeds: [errorEmbed('Enter a valid amount or "all".')], flags: 64 });
  if (amount > bal.bank) return interaction.reply({ embeds: [errorEmbed(`You only have ${sym}${fmt(bal.bank)} in your bank.`)], flags: 64 });
  bal.bank -= amount;
  bal.cash = Math.min(bal.cash + amount, config.maxBalance);
  await bal.save();
  return interaction.reply({ embeds: [successEmbed('Withdrawn', `${sym}${fmt(amount)} moved to your cash.\n**Cash:** ${sym}${fmt(bal.cash)}  **Bank:** ${sym}${fmt(bal.bank)}`)], flags: 64 });
}

// ─────────────────────────────────────────────────────────────────────────────
// GIVE MONEY
// ─────────────────────────────────────────────────────────────────────────────
export async function runGive(interaction, targetUser, amount) {
  const config = await getConfigOrFail(interaction);
  if (!config) return;
  const sym = config.currencySymbol;
  const userId = interaction.user.id;
  const targetId = targetUser.id;
  if (targetId === userId) return interaction.reply({ embeds: [errorEmbed('You cannot give money to yourself.')], flags: 64 });
  if (isNaN(amount) || amount < 1) return interaction.reply({ embeds: [errorEmbed('Enter a valid amount.')], flags: 64 });
  const bal = await getBalance(interaction.guildId, userId, config.startingBalance);
  if (bal.cash < amount) return interaction.reply({ embeds: [errorEmbed(`You only have ${sym}${fmt(bal.cash)} in cash.`)], flags: 64 });
  const targetBal = await getBalance(interaction.guildId, targetId, config.startingBalance);
  bal.cash -= amount;
  targetBal.cash = Math.min(targetBal.cash + amount, config.maxBalance);
  await Promise.all([bal.save(), targetBal.save()]);
  return interaction.reply({ embeds: [successEmbed('Money Given', `You gave ${sym}${fmt(amount)} to ${targetUser}.\n**Your Cash:** ${sym}${fmt(bal.cash)}`)], flags: 64 });
}

// ─────────────────────────────────────────────────────────────────────────────
// WORK
// ─────────────────────────────────────────────────────────────────────────────
export async function runWork(interaction) {
  const config = await getConfigOrFail(interaction);
  if (!config) return;
  const sym = config.currencySymbol;
  if (!config.work.enabled) return interaction.reply({ embeds: [errorEmbed('Work is disabled on this server.')], flags: 64 });
  if (!hasPermission(interaction.member, config.permissions?.workRoles)) return interaction.reply({ embeds: [errorEmbed('You do not have the required role to work.')], flags: 64 });
  const bal = await getBalance(interaction.guildId, interaction.user.id, config.startingBalance);
  const rem = cooldownRemaining(bal.workCooldown, config.work.cooldown);
  if (rem > 0) return interaction.reply({ embeds: [errorEmbed(`You can work again in **${formatMs(rem)}**.`)], flags: 64 });
  const pay = Math.floor(Math.random() * (config.work.maxPayout - config.work.minPayout + 1)) + config.work.minPayout;
  bal.cash = Math.min(bal.cash + pay, config.maxBalance);
  bal.workCooldown = new Date();
  await bal.save();
  const defaults = [
    `You fixed cars at the mechanic shop and earned ${sym}${fmt(pay)}.`,
    `You delivered packages across the city and earned ${sym}${fmt(pay)}.`,
    `You worked a shift at the gas station and earned ${sym}${fmt(pay)}.`,
    `You drove a taxi all night and earned ${sym}${fmt(pay)}.`,
    `You unloaded cargo at the docks and earned ${sym}${fmt(pay)}.`,
    `You worked as a bouncer at a nightclub and earned ${sym}${fmt(pay)}.`,
    `You ran a chop shop job and earned ${sym}${fmt(pay)}.`,
    `You made some deliveries for Maze Bank and earned ${sym}${fmt(pay)}.`,
  ];
  const replies = config.work.customReplies?.length > 0
    ? config.work.customReplies.map(r => r.replace('{amount}', `${sym}${fmt(pay)}`))
    : defaults;
  return interaction.reply({ embeds: [successEmbed('Work Complete', `${replies[Math.floor(Math.random() * replies.length)]}\n-# Next work: ${formatMs(config.work.cooldown * 60 * 1000)}`)], flags: 64 });
}

// ─────────────────────────────────────────────────────────────────────────────
// CRIME
// ─────────────────────────────────────────────────────────────────────────────
export async function runCrime(interaction) {
  const config = await getConfigOrFail(interaction);
  if (!config) return;
  const sym = config.currencySymbol;
  if (!config.crime.enabled) return interaction.reply({ embeds: [errorEmbed('Crime is disabled on this server.')], flags: 64 });
  if (!hasPermission(interaction.member, config.permissions?.crimeRoles)) return interaction.reply({ embeds: [errorEmbed('You do not have the required role to commit crimes.')], flags: 64 });
  const bal = await getBalance(interaction.guildId, interaction.user.id, config.startingBalance);
  const rem = cooldownRemaining(bal.crimeCooldown, config.crime.cooldown);
  if (rem > 0) return interaction.reply({ embeds: [errorEmbed(`You can commit a crime again in **${formatMs(rem)}**.`)], flags: 64 });
  bal.crimeCooldown = new Date();
  const success = Math.random() * 100 < config.crime.successRate;
  if (success) {
    const pay = Math.floor(Math.random() * (config.crime.maxPayout - config.crime.minPayout + 1)) + config.crime.minPayout;
    bal.cash = Math.min(bal.cash + pay, config.maxBalance);
    await bal.save();
    const defaults = [
      `You robbed a convenience store and got away with ${sym}${fmt(pay)}.`,
      `You hacked into a corporate account and siphoned ${sym}${fmt(pay)}.`,
      `You pickpocketed tourists on the strip and pocketed ${sym}${fmt(pay)}.`,
      `You boosted a car and sold it to a chop shop for ${sym}${fmt(pay)}.`,
      `You ran a heist on a Fleeca bank and scored ${sym}${fmt(pay)}.`,
      `You dealt some contraband and made ${sym}${fmt(pay)}.`,
    ];
    const replies = config.crime.customReplies?.length > 0
      ? config.crime.customReplies.map(r => r.replace('{amount}', `${sym}${fmt(pay)}`))
      : defaults;
    return interaction.reply({ embeds: [successEmbed('Crime Successful', `${replies[Math.floor(Math.random() * replies.length)]}\n-# Next crime: ${formatMs(config.crime.cooldown * 60 * 1000)}`)], flags: 64 });
  } else {
    const fine = Math.floor(config.crime.maxPayout * (config.crime.fineRate / 100));
    bal.cash = Math.max(0, bal.cash - fine);
    await bal.save();
    return interaction.reply({ embeds: [{ color: 0xf04747, title: 'Crime Failed', description: `You got caught and paid a fine of **${sym}${fmt(fine)}**.\n-# Next crime: ${formatMs(config.crime.cooldown * 60 * 1000)}`, footer: { text: 'RPM' } }], flags: 64 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ROB
// ─────────────────────────────────────────────────────────────────────────────
export async function runRob(interaction, targetUser) {
  const config = await getConfigOrFail(interaction);
  if (!config) return;
  const sym = config.currencySymbol;
  if (!config.rob.enabled) return interaction.reply({ embeds: [errorEmbed('Robbing is disabled.')], flags: 64 });
  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const targetId = targetUser.id;
  if (targetId === userId) return interaction.reply({ embeds: [errorEmbed('You cannot rob yourself.')], flags: 64 });
  if (targetUser.bot) return interaction.reply({ embeds: [errorEmbed('You cannot rob a bot.')], flags: 64 });
  const bal = await getBalance(guildId, userId, config.startingBalance);
  const rem = cooldownRemaining(bal.robCooldown, config.rob.cooldown);
  if (rem > 0) return interaction.reply({ embeds: [errorEmbed(`You can rob again in **${formatMs(rem)}**.`)], flags: 64 });
  const targetBal = await getBalance(guildId, targetId, config.startingBalance);
  if (targetBal.cash < 10) return interaction.reply({ embeds: [errorEmbed('That user doesn\'t have enough cash to rob.')], flags: 64 });
  bal.robCooldown = new Date();
  const success = Math.random() * 100 < config.rob.successRate;
  if (success) {
    const maxSteal = Math.floor(targetBal.cash * (config.rob.maxStealPercent / 100));
    const stolen = Math.max(1, Math.floor(Math.random() * maxSteal));
    targetBal.cash -= stolen;
    bal.cash = Math.min(bal.cash + stolen, config.maxBalance);
    await Promise.all([bal.save(), targetBal.save()]);
    return interaction.reply({ embeds: [successEmbed('Robbery Successful', `You robbed ${targetUser} and took **${sym}${fmt(stolen)}**!\n**Your Cash:** ${sym}${fmt(bal.cash)}`)], flags: 64 });
  } else {
    const fine = Math.floor(targetBal.cash * 0.1);
    bal.cash = Math.max(0, bal.cash - fine);
    await bal.save();
    return interaction.reply({ embeds: [{ color: 0xf04747, title: 'Robbery Failed', description: `You got caught trying to rob ${targetUser} and paid a fine of **${sym}${fmt(fine)}**.`, footer: { text: 'RPM' } }], flags: 64 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// INCOME
// ─────────────────────────────────────────────────────────────────────────────
export async function runIncome(interaction) {
  const config = await getConfigOrFail(interaction);
  if (!config) return;
  const sym = config.currencySymbol;
  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  if (!config.roleIncome?.length) return interaction.reply({ embeds: [errorEmbed('No role income is configured on this server.')], flags: 64 });
  const memberRoleIds = interaction.member.roles.cache.map(r => r.id);
  const eligible = config.roleIncome.filter(ri => memberRoleIds.includes(ri.roleId));
  if (!eligible.length) return interaction.reply({ embeds: [errorEmbed('You do not have any roles with income configured.')], flags: 64 });
  const bal = await getBalance(guildId, userId, config.startingBalance);
  const incomeCooldowns = bal.incomeCooldowns || new Map();
  let totalEarned = 0;
  const results = [];
  for (const ri of eligible) {
    const last = incomeCooldowns.get(ri.roleId);
    const cdMs = ri.cooldown * 60 * 60 * 1000;
    if (last && Date.now() - last.getTime() < cdMs) {
      results.push(`<@&${ri.roleId}>: ready in ${formatMs(cdMs - (Date.now() - last.getTime()))}`);
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
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(totalEarned > 0 ? 0x43b581 : 0x2d2d2d).setTitle('Role Income').setDescription(desc).setFooter({ text: 'RPM' })], flags: 64 });
}

// ─────────────────────────────────────────────────────────────────────────────
// SHOP (browse)
// ─────────────────────────────────────────────────────────────────────────────
export async function runShop(interaction, query) {
  const config = await getConfigOrFail(interaction);
  if (!config) return;
  const sym = config.currencySymbol;
  const guildId = interaction.guildId;
  const guildItems = await EconomyStore.find({ guildId });
  const allItems = mergeShopItems(guildItems);
  const filtered = query
    ? allItems.filter(i =>
        i.name.toLowerCase().includes(query.toLowerCase()) ||
        (i.category || '').toLowerCase().includes(query.toLowerCase())
      )
    : allItems;
  if (!filtered.length) return interaction.reply({ embeds: [errorEmbed(`No items found matching **"${query}"**.`)], flags: 64 });
  const row = buildShopSelectMenu(filtered, sym, null);
  const pricedCount = allItems.filter(i => i.price != null).length;
  const desc = query
    ? `Showing **${filtered.length}** result${filtered.length !== 1 ? 's' : ''} for **"${query}"**.\nSelect an item to view details. Items showing *No price set* must be priced by staff before they can be purchased.`
    : `**${allItems.length}** item${allItems.length !== 1 ? 's' : ''} in catalog — **${pricedCount}** available for purchase.\nUse \`/shop search:\` to filter by name or category. Items showing *No price set* must be priced by staff first.`;
  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(0x2d2d2d).setTitle('🛒 Server Store').setDescription(desc).setFooter({ text: 'RPM' })],
    components: row ? [row] : [],
    flags: 64,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// INVENTORY
// ─────────────────────────────────────────────────────────────────────────────
export async function runInventory(interaction) {
  const config = await getConfigOrFail(interaction);
  if (!config) return;
  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const inv = await EconomyInventory.findOne({ guildId, userId });
  if (!inv?.items?.length) return interaction.reply({ embeds: [errorEmbed('Your inventory is empty.')], flags: 64 });
  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(0x2d2d2d)
      .setTitle(`${interaction.user.username}'s Inventory`)
      .setDescription(inv.items.map(i => `**${i.itemName}** x${i.quantity}`).join('\n'))
      .setFooter({ text: 'RPM' })],
    flags: 64,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// BUY
// ─────────────────────────────────────────────────────────────────────────────
export async function runBuy(interaction, itemName, quantity) {
  const config = await getConfigOrFail(interaction);
  if (!config) return;
  const sym = config.currencySymbol;
  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const qty = quantity || 1;
  if (qty < 1 || !Number.isInteger(qty)) return interaction.reply({ embeds: [errorEmbed('Quantity must be a positive integer.')], flags: 64 });
  const guildItem = await EconomyStore.findOne({ guildId, name: new RegExp(`^${itemName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
  const isKnownVehicle = GTA_VEHICLES.some(v => v.name.toLowerCase() === itemName.toLowerCase());
  if (!guildItem && !isKnownVehicle) return interaction.reply({ embeds: [errorEmbed(`No item found named **"${itemName}"**. Use \`/shop\` to browse available items.`)], flags: 64 });
  if (!guildItem) return interaction.reply({ embeds: [errorEmbed(`**${itemName}** has no price set. Ask a staff member to price it via \`/economysetup\` before it can be purchased.`)], flags: 64 });
  const total = guildItem.price * qty;
  const bal = await getBalance(guildId, userId, config.startingBalance);
  if (bal.cash < total) return interaction.reply({ embeds: [errorEmbed(`You need ${sym}${fmt(total)} but only have ${sym}${fmt(bal.cash)} cash.`)], flags: 64 });
  bal.cash -= total;
  await bal.save();
  let inv = await EconomyInventory.findOne({ guildId, userId }) || new EconomyInventory({ guildId, userId, items: [] });
  const ex = inv.items.find(i => i.itemName.toLowerCase() === guildItem.name.toLowerCase());
  if (ex) ex.quantity += qty; else inv.items.push({ itemName: guildItem.name, quantity: qty });
  inv.markModified('items');
  await inv.save();
  return interaction.reply({ embeds: [successEmbed('Purchase Complete', `Bought **${guildItem.name}** x${qty} for **${sym}${fmt(total)}**.\n**Remaining Cash:** ${sym}${fmt(bal.cash)}`)], flags: 64 });
}

// ─────────────────────────────────────────────────────────────────────────────
// SELL
// ─────────────────────────────────────────────────────────────────────────────
export async function runSell(interaction, itemName, quantity) {
  const config = await getConfigOrFail(interaction);
  if (!config) return;
  const sym = config.currencySymbol;
  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const qty = quantity || 1;
  const inv = await EconomyInventory.findOne({ guildId, userId });
  const invItem = inv?.items.find(i => i.itemName.toLowerCase() === itemName.toLowerCase());
  if (!invItem) return interaction.reply({ embeds: [errorEmbed(`You don't have **"${itemName}"** in your inventory.`)], flags: 64 });
  if (invItem.quantity < qty) return interaction.reply({ embeds: [errorEmbed(`You only have **${invItem.quantity}** of that item.`)], flags: 64 });
  const guildItem = await EconomyStore.findOne({ guildId, name: new RegExp(`^${itemName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
  const price = guildItem ? guildItem.price : 0;
  const payout = Math.floor(price * 0.5) * qty;
  invItem.quantity -= qty;
  if (invItem.quantity <= 0) inv.items = inv.items.filter(i => i.itemName.toLowerCase() !== itemName.toLowerCase());
  inv.markModified('items');
  await inv.save();
  const bal = await getBalance(guildId, userId, config.startingBalance);
  bal.cash = Math.min(bal.cash + payout, config.maxBalance);
  await bal.save();
  const payoutNote = price > 0 ? `for **${sym}${fmt(payout)}** (50% value)` : 'for **nothing** (item had no price set)';
  return interaction.reply({ embeds: [successEmbed('Item Sold', `Sold **${invItem.itemName}** x${qty} ${payoutNote}.\n**Cash:** ${sym}${fmt(bal.cash)}`)], flags: 64 });
}

// ─────────────────────────────────────────────────────────────────────────────
// USE ITEM
// ─────────────────────────────────────────────────────────────────────────────
export async function runUse(interaction, itemName) {
  const config = await getConfigOrFail(interaction);
  if (!config) return;
  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const inv = await EconomyInventory.findOne({ guildId, userId });
  const invItem = inv?.items.find(i => i.itemName.toLowerCase() === itemName.toLowerCase());
  if (!invItem) return interaction.reply({ embeds: [errorEmbed(`You don't have **"${itemName}"** in your inventory.`)], flags: 64 });
  const storeItem = await EconomyStore.findOne({ guildId, name: new RegExp(`^${itemName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
  if (!storeItem?.usable) return interaction.reply({ embeds: [errorEmbed(`**${invItem.itemName}** is not a usable item.`)], flags: 64 });
  invItem.quantity--;
  if (invItem.quantity <= 0) inv.items = inv.items.filter(i => i.itemName.toLowerCase() !== itemName.toLowerCase());
  inv.markModified('items');
  await inv.save();
  const effect = storeItem.useEffect || 'You used the item.';
  return interaction.reply({ embeds: [successEmbed(`Used ${invItem.itemName}`, effect)], flags: 64 });
}

// ─────────────────────────────────────────────────────────────────────────────
// GIVE ITEM
// ─────────────────────────────────────────────────────────────────────────────
export async function runGiveItem(interaction, targetUser, itemName, quantity) {
  const config = await getConfigOrFail(interaction);
  if (!config) return;
  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const targetId = targetUser.id;
  const qty = quantity || 1;
  if (targetId === userId) return interaction.reply({ embeds: [errorEmbed('You cannot give items to yourself.')], flags: 64 });
  const inv = await EconomyInventory.findOne({ guildId, userId });
  const invItem = inv?.items.find(i => i.itemName.toLowerCase() === itemName.toLowerCase());
  if (!invItem) return interaction.reply({ embeds: [errorEmbed(`You don't have **"${itemName}"** in your inventory.`)], flags: 64 });
  if (invItem.quantity < qty) return interaction.reply({ embeds: [errorEmbed(`You only have **${invItem.quantity}** of that item.`)], flags: 64 });
  invItem.quantity -= qty;
  if (invItem.quantity <= 0) inv.items = inv.items.filter(i => i.itemName.toLowerCase() !== itemName.toLowerCase());
  inv.markModified('items');
  await inv.save();
  let targetInv = await EconomyInventory.findOne({ guildId, userId: targetId }) || new EconomyInventory({ guildId, userId: targetId, items: [] });
  const targetItem = targetInv.items.find(i => i.itemName.toLowerCase() === invItem.itemName.toLowerCase());
  if (targetItem) targetItem.quantity += qty; else targetInv.items.push({ itemName: invItem.itemName, quantity: qty });
  targetInv.markModified('items');
  await targetInv.save();
  return interaction.reply({ embeds: [successEmbed('Item Given', `You gave **${invItem.itemName}** x${qty} to ${targetUser}.`)], flags: 64 });
}

// ─────────────────────────────────────────────────────────────────────────────
// GAMBLING — individual games
// ─────────────────────────────────────────────────────────────────────────────
const SUITS = ['♠','♥','♦','♣'];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
function newDeck() { return [...SUITS.flatMap(s => RANKS.map(r => ({ r, s })))].sort(() => Math.random() - 0.5); }
function cardValue(c) { if (['J','Q','K'].includes(c.r)) return 10; if (c.r === 'A') return 11; return parseInt(c.r); }
function handTotal(hand) { let t = hand.reduce((s,c) => s + cardValue(c), 0); let aces = hand.filter(c => c.r === 'A').length; while (t > 21 && aces-- > 0) t -= 10; return t; }
function handStr(hand) { return hand.map(c => `\`${c.r}${c.s}\``).join(' '); }
const SLOT_SYMS = ['🍒','🍋','🍊','🍇','⭐','💎'];
const SLOT_W    = [30, 25, 20, 15, 7, 3];
function spinSlot() { const r = Math.random() * 100; let acc = 0; for (let i = 0; i < SLOT_SYMS.length; i++) { acc += SLOT_W[i]; if (r < acc) return SLOT_SYMS[i]; } return SLOT_SYMS[0]; }
function slotMult(reels) { const [a,b,c] = reels; if (a===b && b===c) { if (a==='💎') return 10; if (a==='⭐') return 5; return 3; } if (a===b || b===c || a===c) return 1.5; return 0; }

async function checkGamblingEligible(interaction, config, bet) {
  const sym = config.currencySymbol;
  if (!config.gambling.enabled) { await interaction.reply({ embeds: [errorEmbed('Gambling is disabled on this server.')], flags: 64 }); return null; }
  if (bet < config.gambling.minBet) { await interaction.reply({ embeds: [errorEmbed(`Minimum bet is ${sym}${fmt(config.gambling.minBet)}.`)], flags: 64 }); return null; }
  if (bet > config.gambling.maxBet) { await interaction.reply({ embeds: [errorEmbed(`Maximum bet is ${sym}${fmt(config.gambling.maxBet)}.`)], flags: 64 }); return null; }
  const bal = await getBalance(interaction.guildId, interaction.user.id, config.startingBalance);
  const rem = cooldownRemaining(bal.gamblingCooldown, config.gambling.cooldown);
  if (rem > 0) { await interaction.reply({ embeds: [errorEmbed(`Gambling cooldown: **${formatMs(rem)}**.`)], flags: 64 }); return null; }
  if (bal.cash < bet) { await interaction.reply({ embeds: [errorEmbed(`You need ${sym}${fmt(bet)} cash but only have ${sym}${fmt(bal.cash)}.`)], flags: 64 }); return null; }
  return bal;
}

export async function runBlackjack(interaction, bet) {
  const config = await getConfigOrFail(interaction);
  if (!config) return;
  const sym = config.currencySymbol;
  const bal = await checkGamblingEligible(interaction, config, bet);
  if (!bal) return;
  const deck = newDeck();
  const player = [deck.pop(), deck.pop()];
  const dealer = [deck.pop(), deck.pop()];
  const pt = handTotal(player);
  const dt = handTotal(dealer);
  let result, winnings;
  if (pt === 21) { result = 'blackjack'; winnings = Math.floor(bet * 1.5); }
  else if (dt === 21) { result = 'dealer_blackjack'; winnings = -bet; }
  else {
    let p = pt; let d = dt;
    while (d < 17) { dealer.push(deck.pop()); d = handTotal(dealer); }
    if (p > 21) { result = 'bust'; winnings = -bet; }
    else if (d > 21) { result = 'dealer_bust'; winnings = bet; }
    else if (p > d) { result = 'win'; winnings = bet; }
    else if (d > p) { result = 'lose'; winnings = -bet; }
    else { result = 'push'; winnings = 0; }
  }
  bal.cash = Math.max(0, Math.min(bal.cash + winnings, config.maxBalance));
  bal.gamblingCooldown = new Date();
  await bal.save();
  const color = winnings > 0 ? 0x43b581 : winnings < 0 ? 0xf04747 : 0x2d2d2d;
  const titles = { blackjack: '🃏 Blackjack!', dealer_blackjack: '🃏 Dealer Blackjack', bust: '🃏 Bust!', dealer_bust: '🃏 Dealer Bust — You Win!', win: '🃏 You Win!', lose: '🃏 Dealer Wins', push: '🃏 Push — Tie' };
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(color).setTitle(titles[result]).addFields({ name: 'Your Hand', value: `${handStr(player)} **(${handTotal(player)})**`, inline: true }, { name: 'Dealer Hand', value: `${handStr(dealer)} **(${handTotal(dealer)})**`, inline: true }).setDescription(winnings >= 0 ? `You won **${sym}${fmt(Math.abs(winnings))}**!\n**Cash:** ${sym}${fmt(bal.cash)}` : `You lost **${sym}${fmt(Math.abs(winnings))}**.\n**Cash:** ${sym}${fmt(bal.cash)}`).setFooter({ text: 'RPM' })], flags: 64 });
}

export async function runRoulette(interaction, bet, choice) {
  const config = await getConfigOrFail(interaction);
  if (!config) return;
  const sym = config.currencySymbol;
  const c = choice.toLowerCase().trim();
  if (!['red', 'black', 'green'].includes(c)) return interaction.reply({ embeds: [errorEmbed('Choice must be **red**, **black**, or **green**.')], flags: 64 });
  const bal = await checkGamblingEligible(interaction, config, bet);
  if (!bal) return;
  const spin = Math.floor(Math.random() * 37);
  const reds = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
  const resultColor = spin === 0 ? 'green' : reds.includes(spin) ? 'red' : 'black';
  const mult = c === resultColor ? (c === 'green' ? 14 : 2) : 0;
  const winnings = mult > 0 ? Math.floor(bet * (mult - 1)) : -bet;
  bal.cash = Math.max(0, Math.min(bal.cash + winnings, config.maxBalance));
  bal.gamblingCooldown = new Date();
  await bal.save();
  const emoji = { red: '🔴', black: '⚫', green: '🟢' };
  const won = winnings > 0;
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(won ? 0x43b581 : 0xf04747).setTitle('🎡 Roulette').setDescription(`The ball landed on **${emoji[resultColor]} ${resultColor} (${spin})**.\nYou bet on **${emoji[c]} ${c}**.\n\n${won ? `You won **${sym}${fmt(Math.abs(winnings))}**!` : winnings === 0 ? 'Push — your bet returned.' : `You lost **${sym}${fmt(Math.abs(winnings))}**.`}\n**Cash:** ${sym}${fmt(bal.cash)}`).setFooter({ text: 'RPM' })], flags: 64 });
}

export async function runSlots(interaction, bet) {
  const config = await getConfigOrFail(interaction);
  if (!config) return;
  const sym = config.currencySymbol;
  const bal = await checkGamblingEligible(interaction, config, bet);
  if (!bal) return;
  const reels = [spinSlot(), spinSlot(), spinSlot()];
  const mult = slotMult(reels);
  const winnings = mult > 0 ? Math.floor(bet * mult) - bet : -bet;
  bal.cash = Math.max(0, Math.min(bal.cash + winnings, config.maxBalance));
  bal.gamblingCooldown = new Date();
  await bal.save();
  const won = winnings >= 0;
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(won ? 0x43b581 : 0xf04747).setTitle('🎰 Slots').setDescription(`**${reels.join(' | ')}**\n\n${won ? `${mult}x — You won **${sym}${fmt(Math.abs(winnings))}**!` : `No match — You lost **${sym}${fmt(Math.abs(winnings))}**.`}\n**Cash:** ${sym}${fmt(bal.cash)}`).setFooter({ text: 'RPM' })], flags: 64 });
}

export async function runDiceRoll(interaction, bet) {
  const config = await getConfigOrFail(interaction);
  if (!config) return;
  const sym = config.currencySymbol;
  const bal = await checkGamblingEligible(interaction, config, bet);
  if (!bal) return;
  const player = Math.ceil(Math.random() * 6) + Math.ceil(Math.random() * 6);
  const dealer = Math.ceil(Math.random() * 6) + Math.ceil(Math.random() * 6);
  const won = player > dealer;
  const tied = player === dealer;
  const winnings = won ? bet : tied ? 0 : -bet;
  bal.cash = Math.max(0, Math.min(bal.cash + winnings, config.maxBalance));
  bal.gamblingCooldown = new Date();
  await bal.save();
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(won ? 0x43b581 : tied ? 0x2d2d2d : 0xf04747).setTitle('🎲 Dice Roll').setDescription(`**You rolled:** ${player}\n**Dealer rolled:** ${dealer}\n\n${won ? `You win **${sym}${fmt(bet)}**!` : tied ? 'Tie — no change.' : `You lose **${sym}${fmt(bet)}**.`}\n**Cash:** ${sym}${fmt(bal.cash)}`).setFooter({ text: 'RPM' })], flags: 64 });
}

export async function runRussianRoulette(interaction, bet) {
  const config = await getConfigOrFail(interaction);
  if (!config) return;
  const sym = config.currencySymbol;
  const bal = await checkGamblingEligible(interaction, config, bet);
  if (!bal) return;
  const survived = Math.random() > 1 / 6;
  let winnings;
  if (survived) { winnings = bet; }
  else { winnings = -bal.cash; }
  bal.cash = Math.max(0, Math.min(bal.cash + winnings, config.maxBalance));
  bal.gamblingCooldown = new Date();
  await bal.save();
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(survived ? 0x43b581 : 0xf04747).setTitle('🔫 Russian Roulette').setDescription(survived ? `*Click.* You survived!\nYou win **${sym}${fmt(bet)}**.\n**Cash:** ${sym}${fmt(bal.cash)}` : `*BANG.* You lose everything.\n**Cash:** ${sym}${fmt(bal.cash)}`).setFooter({ text: 'RPM' })], flags: 64 });
}

export async function runCockFight(interaction, bet) {
  const config = await getConfigOrFail(interaction);
  if (!config) return;
  const sym = config.currencySymbol;
  const bal = await checkGamblingEligible(interaction, config, bet);
  if (!bal) return;
  const won = Math.random() < 0.5;
  const winnings = won ? Math.floor(bet * 0.8) : -bet;
  bal.cash = Math.max(0, Math.min(bal.cash + winnings, config.maxBalance));
  bal.gamblingCooldown = new Date();
  await bal.save();
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(won ? 0x43b581 : 0xf04747).setTitle('🐓 Cock Fight').setDescription(won ? `Your rooster won!\nYou gain **${sym}${fmt(Math.abs(winnings))}**.\n**Cash:** ${sym}${fmt(bal.cash)}` : `Your rooster lost.\nYou lose **${sym}${fmt(Math.abs(winnings))}**.\n**Cash:** ${sym}${fmt(bal.cash)}`).setFooter({ text: 'RPM' })], flags: 64 });
}

// ─────────────────────────────────────────────────────────────────────────────
// SHOP SELECT — handler for economy_shop_browse_select interactions
// ─────────────────────────────────────────────────────────────────────────────
export async function handleShopBrowseSelect(interaction) {
  const guildId = interaction.guildId;
  const value = interaction.values[0];
  if (!value.startsWith('__item__')) return;
  const itemName = value.slice('__item__'.length);
  const config = await getConfig(guildId);
  const sym = config?.currencySymbol || '$';
  const guildItem = await EconomyStore.findOne({ guildId, name: new RegExp(`^${itemName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
  const builtIn = GTA_VEHICLES.find(v => v.name.toLowerCase() === itemName.toLowerCase());
  if (!guildItem && !builtIn) return interaction.update({ embeds: [errorEmbed('Item not found.')], components: [], content: '' });
  const name = guildItem?.name || builtIn?.name || itemName;
  const description = guildItem?.description || builtIn?.description || 'No description.';
  const category = builtIn?.category || 'Custom';
  const usable = guildItem?.usable ? ' *(usable)*' : '';
  const priceField = guildItem
    ? `${sym}${fmt(guildItem.price)}`
    : '*No price set — ask staff to price this item via `/economysetup`*';
  const footerNote = guildItem
    ? 'RPM — Use /buy to purchase this item'
    : 'RPM — This item is not yet available for purchase';
  const embed = new EmbedBuilder().setColor(guildItem ? 0x2d2d2d : 0xfaa61a).setTitle(name)
    .addFields(
      { name: 'Price', value: priceField, inline: true },
      { name: 'Category', value: category + usable, inline: true },
    )
    .setDescription(description)
    .setFooter({ text: footerNote });
  return interaction.update({ embeds: [embed], components: [], content: '' });
}
