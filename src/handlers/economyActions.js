import {
  EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  UserSelectMenuBuilder,
} from 'discord.js';
import { createHash } from 'crypto';
import EconomyConfig from '../models/EconomyConfig.js';
import EconomyBalance from '../models/EconomyBalance.js';
import EconomyStore from '../models/EconomyStore.js';
import EconomyInventory from '../models/EconomyInventory.js';
import BusinessAccount from '../models/BusinessAccount.js';
import BusinessTransaction from '../models/BusinessTransaction.js';
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

const SHOP_CATEGORIES = ['Super', 'Sports', 'Muscle', 'SUV', 'Sedan', 'Truck', 'Motorcycle', 'Helicopter', 'Plane', 'Boat'];

function buildCategoryButtons(extraRow) {
  const cats = SHOP_CATEGORIES;
  const rows = [];
  for (let i = 0; i < cats.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(
      cats.slice(i, i + 5).map(cat =>
        new ButtonBuilder().setCustomId(`economy_shop_cat_${cat}`).setLabel(cat).setStyle(ButtonStyle.Secondary)
      )
    ));
  }
  if (extraRow) rows.push(extraRow);
  return rows;
}

function shopItemLines(items, sym) {
  return items.map(i => {
    const price = i.price != null ? `**${sym}${fmt(i.price)}**` : '*No price set*';
    const lock = i.requiredRoleId ? ` · requires <@&${i.requiredRoleId}>` : '';
    return `• **${i.name}** - ${price}${lock}`;
  });
}

export function mergeShopItems(guildItems) {
  const guildNames = new Set(guildItems.map(i => i.name.toLowerCase()));
  const builtIns = GTA_VEHICLES
    .filter(v => !guildNames.has(v.name.toLowerCase()))
    .map(v => ({ name: v.name, price: null, description: v.description, category: v.category, isBuiltIn: true }));
  const guildFormatted = guildItems.map(i => ({
    name: i.name, price: i.price, description: i.description, category: 'Custom', isBuiltIn: false, requiredRoleId: i.requiredRoleId || null,
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
  const target = interaction.options.getUser('user') || interaction.user;
  const bal = await getBalance(interaction.guildId, target.id, config.startingBalance);
  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(0x2d2d2d)
      .setTitle(`${target.username}'s Balance`)
      .setDescription(`**Cash:** ${sym}${fmt(bal.cash)}\n**Bank:** ${sym}${fmt(bal.bank)}\n**Total:** ${sym}${fmt(bal.cash + bal.bank)}`)
      .setFooter({ text: 'RPM' })],
    flags: 64,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// LEADERBOARD
// ─────────────────────────────────────────────────────────────────────────────
export async function runLeaderboard(interaction, size = 10) {
  const config = await getConfigOrFail(interaction);
  if (!config) return;
  const sym = config.currencySymbol;
  const fetchLimit = Math.max(size, 25);
  const top = await EconomyBalance.find({ guildId: interaction.guildId }).limit(fetchLimit);
  const sorted = top.sort((a, b) => (b.cash + b.bank) - (a.cash + a.bank));
  const lines = sorted.slice(0, size).map((e, i) => `**${i + 1}.** <@${e.userId}> - ${sym}${fmt(e.cash + e.bank)}`);
  const footerText = size > 10 ? `RPM • Premium - Top ${size}` : 'RPM';
  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(0x2d2d2d)
      .setTitle('Economy Leaderboard')
      .setDescription(lines.join('\n') || 'No data yet.')
      .setFooter({ text: footerText })],
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

  // DM the recipient
  try {
    await targetUser.send({
      embeds: [new EmbedBuilder()
        .setColor('#2d2d2d')
        .setTitle('💰 Payment Received')
        .setDescription(`**${interaction.user.username}** sent you **${sym}${fmt(amount)}** in **${interaction.guild.name}**.\n**New Cash Balance:** ${sym}${fmt(targetBal.cash)}`)
        .setFooter({ text: `${interaction.guild.name} • RPM` })],
    });
  } catch { /* DMs closed or user not reachable — non-fatal */ }

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

  const memberRoleIds = interaction.member.roles.cache.map(r => r.id);
  const eligibleIncome = (config.roleIncome || []).filter(ri => memberRoleIds.includes(ri.roleId));
  const eligibleDeductions = (config.roleDeductions || []).filter(rd => memberRoleIds.includes(rd.roleId));

  if (!eligibleIncome.length && !eligibleDeductions.length) {
    return interaction.reply({ embeds: [errorEmbed('No role income or deductions are configured for your roles.')], flags: 64 });
  }

  const bal = await getBalance(guildId, userId, config.startingBalance);
  const incomeCooldowns = bal.incomeCooldowns || new Map();
  let totalEarned = 0;
  let totalDeducted = 0;
  const results = [];

  for (const ri of eligibleIncome) {
    const last = incomeCooldowns.get(ri.roleId);
    const cdMs = ri.cooldown * 60 * 60 * 1000;
    if (last && Date.now() - last.getTime() < cdMs) {
      results.push(`<@&${ri.roleId}>: ready in ${formatMs(cdMs - (Date.now() - last.getTime()))}`);
    } else {
      totalEarned += ri.amount;
      incomeCooldowns.set(ri.roleId, new Date());
      results.push(`<@&${ri.roleId}>: +**${sym}${fmt(ri.amount)}**`);
    }
  }

  for (const rd of eligibleDeductions) {
    const key = `deduction_${rd.roleId}`;
    const last = incomeCooldowns.get(key);
    const cdMs = rd.cooldown * 60 * 60 * 1000;
    if (last && Date.now() - last.getTime() < cdMs) {
      results.push(`${rd.label} (<@&${rd.roleId}>): ready in ${formatMs(cdMs - (Date.now() - last.getTime()))}`);
    } else {
      totalDeducted += rd.amount;
      incomeCooldowns.set(key, new Date());
      results.push(`${rd.label} (<@&${rd.roleId}>): -**${sym}${fmt(rd.amount)}**`);
    }
  }

  const net = totalEarned - totalDeducted;
  if (totalEarned > 0 || totalDeducted > 0) {
    bal.cash = Math.min(Math.max(0, bal.cash + net), config.maxBalance);
    bal.incomeCooldowns = incomeCooldowns;
    bal.markModified('incomeCooldowns');
    await bal.save();
  }

  let summary = '';
  if (totalEarned > 0) summary += `\n**Gross Income:** ${sym}${fmt(totalEarned)}`;
  if (totalDeducted > 0) summary += `\n**Deductions:** -${sym}${fmt(totalDeducted)}`;
  if (totalEarned > 0 || totalDeducted > 0) summary += `\n**Net:** ${sym}${fmt(net < 0 ? 0 : net)}`;

  const desc = results.join('\n') + (summary ? `\n${summary}` : '');
  const color = net > 0 ? 0x43b581 : net < 0 ? 0xf04747 : 0x2d2d2d;
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(color).setTitle('Role Income').setDescription(desc).setFooter({ text: 'RPM' })], flags: 64 });
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

  if (query) {
    const filtered = allItems.filter(i =>
      i.name.toLowerCase().includes(query.toLowerCase()) ||
      (i.category || '').toLowerCase().includes(query.toLowerCase())
    );
    if (!filtered.length) return interaction.reply({ embeds: [errorEmbed(`No items found matching **"${query}"**.`)], flags: 64 });
    const lines = shopItemLines(filtered, sym);
    const chunks = [];
    for (let i = 0; i < lines.length; i += 20) chunks.push(lines.slice(i, i + 20).join('\n'));
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0x2d2d2d)
        .setTitle(`Search: "${query}"`)
        .setDescription(`Found **${filtered.length}** item${filtered.length !== 1 ? 's' : ''}.\n\n${chunks[0]}`)
        .setFooter({ text: 'Use /buy to purchase · RPM' })],
      flags: 64,
    });
  }

  const pricedCount = allItems.filter(i => i.price != null).length;
  const customCount = guildItems.length;
  const catCounts = SHOP_CATEGORIES.map(cat => {
    const n = GTA_VEHICLES.filter(v => v.category === cat).length;
    return `**${cat}** (${n})`;
  });
  const customRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('economy_shop_cat_Custom').setLabel(`Custom Items (${customCount})`).setStyle(ButtonStyle.Primary)
  );
  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(0x2d2d2d)
      .setTitle('Server Store')
      .setDescription(
        `**${allItems.length}** items in catalog - **${pricedCount}** available for purchase.\n` +
        `Items without a price must be priced by staff first.\n\n` +
        `**GTA V Categories:**\n${catCounts.join(' · ')}\n\n` +
        `Use \`/buy item:\` to purchase - start typing the item name for suggestions.\n` +
        `Use \`/shop search:\` to filter by name or category.`
      )
      .setFooter({ text: 'Select a category below · RPM' })],
    components: [...buildCategoryButtons(customRow)],
    flags: 64,
  });
}

export async function handleShopMainButton(interaction) {
  const guildId = interaction.guildId;
  const config = await EconomyConfig.findOne({ guildId });
  const sym = config?.currencySymbol || '$';
  const guildItems = await EconomyStore.find({ guildId });
  const allItems = mergeShopItems(guildItems);
  const pricedCount = allItems.filter(i => i.price != null).length;
  const customCount = guildItems.length;
  const catCounts = SHOP_CATEGORIES.map(cat => {
    const n = GTA_VEHICLES.filter(v => v.category === cat).length;
    return `**${cat}** (${n})`;
  });
  const customRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('economy_shop_cat_Custom').setLabel(`Custom Items (${customCount})`).setStyle(ButtonStyle.Primary)
  );
  return interaction.update({
    embeds: [new EmbedBuilder().setColor(0x2d2d2d)
      .setTitle('Server Store')
      .setDescription(
        `**${allItems.length}** items in catalog - **${pricedCount}** available for purchase.\n` +
        `Items without a price must be priced by staff first.\n\n` +
        `**GTA V Categories:**\n${catCounts.join(' · ')}\n\n` +
        `Use \`/buy item:\` to purchase - start typing the item name for suggestions.\n` +
        `Use \`/shop search:\` to filter by name or category.`
      )
      .setFooter({ text: 'Select a category below · RPM' })],
    components: [...buildCategoryButtons(customRow)],
    content: '',
  });
}

export async function handleShopCategoryButton(interaction) {
  const guildId = interaction.guildId;
  const cat = interaction.customId.replace('economy_shop_cat_', '');
  const config = await EconomyConfig.findOne({ guildId });
  const sym = config?.currencySymbol || '$';
  const guildItems = await EconomyStore.find({ guildId });
  const backRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('economy_shop_main').setLabel('← Categories').setStyle(ButtonStyle.Secondary)
  );

  if (cat === 'Custom') {
    if (!guildItems.length) return interaction.update({
      embeds: [new EmbedBuilder().setColor(0x2d2d2d).setTitle('Custom Items').setDescription('No custom items have been added yet. Staff can add items via `/economyconfig`.').setFooter({ text: 'RPM' })],
      components: [backRow], content: '',
    });
    const lines = shopItemLines(guildItems.map(i => ({ name: i.name, price: i.price, description: i.description, requiredRoleId: i.requiredRoleId })), sym);
    return interaction.update({
      embeds: [new EmbedBuilder().setColor(0x2d2d2d)
        .setTitle('Custom Items')
        .setDescription(lines.join('\n'))
        .setFooter({ text: `${guildItems.length} items · Use /buy to purchase · RPM` })],
      components: [backRow], content: '',
    });
  }

  const vehicles = GTA_VEHICLES.filter(v => v.category === cat);
  const allItems = mergeShopItems(guildItems);
  const displayItems = vehicles.map(v => {
    const gi = allItems.find(i => i.name.toLowerCase() === v.name.toLowerCase());
    return { name: v.name, price: gi?.price ?? null };
  });
  const lines = shopItemLines(displayItems, sym);
  const chunks = [];
  for (let i = 0; i < lines.length; i += 20) chunks.push(lines.slice(i, i + 20).join('\n'));
  const pricedHere = displayItems.filter(i => i.price != null).length;
  return interaction.update({
    embeds: [new EmbedBuilder().setColor(0x2d2d2d)
      .setTitle(`${cat} Vehicles`)
      .setDescription(`**${vehicles.length}** vehicles - **${pricedHere}** priced.\n\n${chunks[0]}`)
      .setFooter({ text: 'Use /buy to purchase · RPM' })],
    components: [backRow], content: '',
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
  if (!guildItem) return interaction.reply({ embeds: [errorEmbed(`**${itemName}** has no price set. Ask a staff member to price it via \`/economyconfig\` before it can be purchased.`)], flags: 64 });
  if (guildItem.requiredRoleId && !interaction.member?.roles?.cache?.has(guildItem.requiredRoleId)) {
    return interaction.reply({ embeds: [errorEmbed(`You need the <@&${guildItem.requiredRoleId}> role to purchase **${guildItem.name}**.`)], flags: 64 });
  }
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

  let roleNote = '';
  if (guildItem.roleId && interaction.member) {
    try {
      await interaction.member.roles.add(guildItem.roleId);
      roleNote = `\n**Role Granted:** <@&${guildItem.roleId}>`;
    } catch {
      roleNote = '\n-# Role could not be assigned - check bot permissions.';
    }
  }

  return interaction.reply({ embeds: [successEmbed('Purchase Complete', `Bought **${guildItem.name}** x${qty} for **${sym}${fmt(total)}**.\n**Remaining Cash:** ${sym}${fmt(bal.cash)}${roleNote}`)], flags: 64 });
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
  if (guildItem && guildItem.sellable === false) return interaction.reply({ embeds: [errorEmbed(`**${itemName}** cannot be sold.`)], flags: 64 });
  const price = guildItem ? guildItem.price : 0;
  const sellPct = (config.sellPercent ?? 50) / 100;
  const payout = Math.floor(price * sellPct) * qty;
  invItem.quantity -= qty;
  if (invItem.quantity <= 0) inv.items = inv.items.filter(i => i.itemName.toLowerCase() !== itemName.toLowerCase());
  inv.markModified('items');
  await inv.save();
  const bal = await getBalance(guildId, userId, config.startingBalance);
  bal.cash = Math.min(bal.cash + payout, config.maxBalance);
  await bal.save();
  const pctLabel = `${config.sellPercent ?? 50}% value`;
  const payoutNote = price > 0 ? `for **${sym}${fmt(payout)}** (${pctLabel})` : 'for **nothing** (item had no price set)';
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
// GAMBLING - individual games
// ─────────────────────────────────────────────────────────────────────────────
const SUITS = ['♠','♥','♦','♣'];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
function newDeck() { return [...SUITS.flatMap(s => RANKS.map(r => ({ r, s })))].sort(() => Math.random() - 0.5); }
function cardValue(c) { if (['J','Q','K'].includes(c.r)) return 10; if (c.r === 'A') return 11; return parseInt(c.r); }
function handTotal(hand) { let t = hand.reduce((s,c) => s + cardValue(c), 0); let aces = hand.filter(c => c.r === 'A').length; while (t > 21 && aces-- > 0) t -= 10; return t; }
function handStr(hand) { return hand.map(c => `\`${c.r}${c.s}\``).join(' '); }
const SLOT_SYMS = ['CHR','LMN','ORG','GRP','STR','DMD'];
const SLOT_W    = [30, 25, 20, 15, 7, 3];
function spinSlot() { const r = Math.random() * 100; let acc = 0; for (let i = 0; i < SLOT_SYMS.length; i++) { acc += SLOT_W[i]; if (r < acc) return SLOT_SYMS[i]; } return SLOT_SYMS[0]; }
function slotMult(reels) { const [a,b,c] = reels; if (a===b && b===c) { if (a==='DMD') return 10; if (a==='STR') return 5; return 3; } if (a===b || b===c || a===c) return 1.5; return 0; }

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
  const titles = { blackjack: 'Blackjack!', dealer_blackjack: 'Dealer Blackjack', bust: 'Bust!', dealer_bust: 'Dealer Bust - You Win!', win: 'You Win!', lose: 'Dealer Wins', push: 'Push - Tie' };
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
  const won = winnings > 0;
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(won ? 0x43b581 : 0xf04747).setTitle('Roulette').setDescription(`The ball landed on **${resultColor} (${spin})**.\nYou bet on **${c}**.\n\n${won ? `You won **${sym}${fmt(Math.abs(winnings))}**!` : winnings === 0 ? 'Push - your bet returned.' : `You lost **${sym}${fmt(Math.abs(winnings))}**.`}\n**Cash:** ${sym}${fmt(bal.cash)}`).setFooter({ text: 'RPM' })], flags: 64 });
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
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(won ? 0x43b581 : 0xf04747).setTitle('Slots').setDescription(`**${reels.join(' | ')}**\n\n${won ? `${mult}x - You won **${sym}${fmt(Math.abs(winnings))}**!` : `No match - You lost **${sym}${fmt(Math.abs(winnings))}**.`}\n**Cash:** ${sym}${fmt(bal.cash)}`).setFooter({ text: 'RPM' })], flags: 64 });
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
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(won ? 0x43b581 : tied ? 0x2d2d2d : 0xf04747).setTitle('Dice Roll').setDescription(`**You rolled:** ${player}\n**Dealer rolled:** ${dealer}\n\n${won ? `You win **${sym}${fmt(bet)}**!` : tied ? 'Tie - no change.' : `You lose **${sym}${fmt(bet)}**.`}\n**Cash:** ${sym}${fmt(bal.cash)}`).setFooter({ text: 'RPM' })], flags: 64 });
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
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(survived ? 0x43b581 : 0xf04747).setTitle('Russian Roulette').setDescription(survived ? `*Click.* You survived!\nYou win **${sym}${fmt(bet)}**.\n**Cash:** ${sym}${fmt(bal.cash)}` : `*BANG.* You lose everything.\n**Cash:** ${sym}${fmt(bal.cash)}`).setFooter({ text: 'RPM' })], flags: 64 });
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
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(won ? 0x43b581 : 0xf04747).setTitle('Cock Fight').setDescription(won ? `Your rooster won!\nYou gain **${sym}${fmt(Math.abs(winnings))}**.\n**Cash:** ${sym}${fmt(bal.cash)}` : `Your rooster lost.\nYou lose **${sym}${fmt(Math.abs(winnings))}**.\n**Cash:** ${sym}${fmt(bal.cash)}`).setFooter({ text: 'RPM' })], flags: 64 });
}

// ─────────────────────────────────────────────────────────────────────────────
// SHOP SELECT - handler for economy_shop_browse_select interactions
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
    : '*No price set - ask staff to price this item via `/economyconfig`*';
  const footerNote = guildItem
    ? 'RPM - Use /buy to purchase this item'
    : 'RPM - This item is not yet available for purchase';
  const embed = new EmbedBuilder().setColor(guildItem ? 0x2d2d2d : 0xfaa61a).setTitle(name)
    .addFields(
      { name: 'Price', value: priceField, inline: true },
      { name: 'Category', value: category + usable, inline: true },
    )
    .setDescription(description)
    .setFooter({ text: footerNote });
  return interaction.update({ embeds: [embed], components: [], content: '' });
}

// ─────────────────────────────────────────────────────────────────────────────
// BUSINESS ACCOUNTS
// ─────────────────────────────────────────────────────────────────────────────
function hashPassword(pw) {
  return createHash('sha256').update(pw).digest('hex');
}

async function logTx(account, type, amount, user, note) {
  try {
    await BusinessTransaction.create({
      guildId: account.guildId,
      accountId: account.accountId,
      type,
      amount,
      userId: user?.id || null,
      username: user?.username || null,
      note: note || null,
    });
  } catch { /* non-fatal */ }
}

export async function applyBusinessIncome(account) {
  if (!account.incomeAmount || !account.incomeCooldownHours) return;
  const now = Date.now();
  if (!account.lastIncomeAt) {
    account.lastIncomeAt = new Date();
    await account.save();
    return;
  }
  const cdMs = account.incomeCooldownHours * 60 * 60 * 1000;
  const periods = Math.floor((now - account.lastIncomeAt.getTime()) / cdMs);
  if (periods <= 0) return;
  const earned = periods * account.incomeAmount;
  account.balance = Math.max(0, account.balance + earned);
  account.lastIncomeAt = new Date(account.lastIncomeAt.getTime() + periods * cdMs);
  await account.save();
  await logTx(account, 'income', earned, null, `${periods} cycle(s) of passive income`);
}

function buildBusinessEmbed(account, sym) {
  const incomeDesc = account.incomeAmount
    ? `\n-# Passive income: ${sym}${fmt(account.incomeAmount)} every ${account.incomeCooldownHours}h`
    : '';
  return new EmbedBuilder()
    .setColor('#2d2d2d')
    .setTitle(account.name)
    .setDescription(`### Balance\n${sym}${fmt(account.balance)}${incomeDesc}`)
    .setFooter({ text: 'RPM' });
}

function buildBusinessButtons(accountId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`business_deposit_${accountId}`).setLabel('Deposit').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`business_withdraw_${accountId}`).setLabel('Withdraw').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`business_paymember_${accountId}`).setLabel('Pay Member').setStyle(ButtonStyle.Primary),
  );
}

export async function handleBusinessPayMemberButton(interaction) {
  const accountId = interaction.customId.replace('business_paymember_', '');
  const account = await BusinessAccount.findOne({ accountId }).lean();
  if (!account) return interaction.reply({ embeds: [errorEmbed('Account not found.')], flags: 64 });
  const config = await getConfig(interaction.guildId);
  const sym = config?.currencySymbol || '$';
  const menu = new UserSelectMenuBuilder()
    .setCustomId(`business_paymember_select_${accountId}`)
    .setPlaceholder('Search for a member to pay...')
    .setMinValues(1)
    .setMaxValues(1);
  const row = new ActionRowBuilder().addComponents(menu);
  return interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor('#2d2d2d')
      .setTitle(`Pay Member — ${account.name}`)
      .setDescription(`### Balance\n${sym}${fmt(account.balance)}\nSelect a member below to send them money from this business account.`)
      .setFooter({ text: 'RPM' })],
    components: [row],
    flags: 64,
  });
}

export async function handleBusinessPayMemberSelect(interaction) {
  const accountId = interaction.customId.replace('business_paymember_select_', '');
  const targetUser = interaction.users.first();
  if (!targetUser) return interaction.reply({ embeds: [errorEmbed('No user selected.')], flags: 64 });
  if (targetUser.bot) return interaction.reply({ embeds: [errorEmbed('You cannot pay a bot.')], flags: 64 });
  const modal = new ModalBuilder()
    .setCustomId(`business_paymember_amount_${accountId}_${targetUser.id}`)
    .setTitle(`Pay ${targetUser.username}`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('amount')
          .setLabel('Amount to send')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('e.g. 500')
      )
    );
  return interaction.showModal(modal);
}

export async function handleBusinessPayMemberAmountModal(interaction) {
  const parts = interaction.customId.replace('business_paymember_amount_', '').split('_');
  const targetUserId = parts.pop();
  const accountId = parts.join('_');
  const raw = interaction.fields.getTextInputValue('amount');
  const amount = parseInt(raw);
  if (isNaN(amount) || amount < 1) return interaction.reply({ embeds: [errorEmbed('Enter a valid amount.')], flags: 64 });
  const config = await getConfigOrFail(interaction);
  if (!config) return;
  const sym = config.currencySymbol;
  const account = await BusinessAccount.findOne({ accountId });
  if (!account) return interaction.reply({ embeds: [errorEmbed('Account not found.')], flags: 64 });
  if (account.balance < amount) return interaction.reply({ embeds: [errorEmbed(`The business only has ${sym}${fmt(account.balance)}.`)], flags: 64 });
  const targetBal = await getBalance(interaction.guildId, targetUserId, config.startingBalance);
  account.balance -= amount;
  targetBal.cash = Math.min(targetBal.cash + amount, config.maxBalance);
  let targetTag = targetUserId;
  try {
    const member = await interaction.guild.members.fetch(targetUserId);
    targetTag = member.user.username;
  } catch { /* use ID fallback */ }
  await Promise.all([account.save(), targetBal.save(), logTx(account, 'pay', amount, { id: targetUserId, username: targetTag }, `Paid to ${targetTag}`)]);

  // DM the recipient
  try {
    const targetUser = await interaction.client.users.fetch(targetUserId);
    await targetUser.send({
      embeds: [new EmbedBuilder()
        .setColor('#2d2d2d')
        .setTitle('💼 Payment Received')
        .setDescription(`You received **${sym}${fmt(amount)}** from **${account.name}**.\n**New Cash Balance:** ${sym}${fmt(targetBal.cash)}`)
        .setFooter({ text: `${interaction.guild.name} • RPM` })],
    });
  } catch { /* DMs closed or user not reachable — non-fatal */ }

  return interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor('#2d2d2d')
      .setTitle('Payment Sent')
      .setDescription(`Paid ${sym}${fmt(amount)} to **${targetTag}** from **${account.name}**.\n### Business Balance\n${sym}${fmt(account.balance)}`)
      .setFooter({ text: 'RPM' })],
    components: [buildBusinessButtons(accountId)],
    flags: 64,
  });
}

export async function runBusiness(interaction) {
  const config = await getConfigOrFail(interaction);
  if (!config) return;
  const accounts = await BusinessAccount.find({ guildId: interaction.guildId }).lean();
  if (!accounts.length) {
    return interaction.reply({ embeds: [errorEmbed('No business accounts have been configured for this server.')], flags: 64 });
  }
  const menu = new StringSelectMenuBuilder()
    .setCustomId('business_select')
    .setPlaceholder('Select a business account...')
    .addOptions(accounts.map(a => ({ label: a.name, value: a.accountId })));
  const row = new ActionRowBuilder().addComponents(menu);
  return interaction.reply({
    embeds: [new EmbedBuilder().setColor('#2d2d2d').setTitle('Business Accounts').setDescription('Select a business account to access.').setFooter({ text: 'RPM' })],
    components: [row],
    flags: 64,
  });
}

export async function handleBusinessSelect(interaction) {
  const accountId = interaction.values[0];
  const account = await BusinessAccount.findOne({ accountId }).lean();
  if (!account) return interaction.update({ embeds: [errorEmbed('Account not found.')], components: [] });
  const modal = new ModalBuilder()
    .setCustomId(`business_password_${accountId}`)
    .setTitle(`Access: ${account.name}`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('password').setLabel('Password').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Enter the account password')
      )
    );
  return interaction.showModal(modal);
}

export async function handleBusinessPasswordModal(interaction) {
  const accountId = interaction.customId.replace('business_password_', '');
  const account = await BusinessAccount.findOne({ accountId });
  if (!account) return interaction.reply({ embeds: [errorEmbed('Account not found.')], flags: 64 });
  const entered = interaction.fields.getTextInputValue('password');
  if (hashPassword(entered) !== account.passwordHash) {
    return interaction.reply({ embeds: [errorEmbed('Incorrect password.')], flags: 64 });
  }
  await applyBusinessIncome(account);
  const config = await getConfig(interaction.guildId);
  const sym = config?.currencySymbol || '$';
  return interaction.reply({
    embeds: [buildBusinessEmbed(account, sym)],
    components: [buildBusinessButtons(accountId)],
    flags: 64,
  });
}

export async function handleBusinessDeposit(interaction) {
  const accountId = interaction.customId.replace('business_deposit_', '');
  const modal = new ModalBuilder()
    .setCustomId(`business_do_deposit_${accountId}`)
    .setTitle('Deposit to Business')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('amount').setLabel('Amount').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('e.g. 500')
      )
    );
  return interaction.showModal(modal);
}

export async function handleBusinessWithdraw(interaction) {
  const accountId = interaction.customId.replace('business_withdraw_', '');
  const modal = new ModalBuilder()
    .setCustomId(`business_do_withdraw_${accountId}`)
    .setTitle('Withdraw from Business')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('amount').setLabel('Amount').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('e.g. 500')
      )
    );
  return interaction.showModal(modal);
}

export async function handleBusinessDepositModal(interaction) {
  const accountId = interaction.customId.replace('business_do_deposit_', '');
  const raw = interaction.fields.getTextInputValue('amount');
  const amount = parseInt(raw);
  if (isNaN(amount) || amount < 1) return interaction.reply({ embeds: [errorEmbed('Enter a valid amount.')], flags: 64 });
  const config = await getConfigOrFail(interaction);
  if (!config) return;
  const sym = config.currencySymbol;
  const bal = await getBalance(interaction.guildId, interaction.user.id, config.startingBalance);
  if (bal.cash < amount) return interaction.reply({ embeds: [errorEmbed(`You only have ${sym}${fmt(bal.cash)} in cash.`)], flags: 64 });
  const account = await BusinessAccount.findOne({ accountId });
  if (!account) return interaction.reply({ embeds: [errorEmbed('Account not found.')], flags: 64 });
  bal.cash -= amount;
  account.balance += amount;
  await Promise.all([bal.save(), account.save(), logTx(account, 'deposit', amount, interaction.user)]);
  return interaction.reply({
    embeds: [new EmbedBuilder().setColor('#2d2d2d').setTitle('Deposit Complete')
      .setDescription(`Deposited ${sym}${fmt(amount)} into **${account.name}**.\n### Business Balance\n${sym}${fmt(account.balance)}\n### Your Cash\n${sym}${fmt(bal.cash)}`)
      .setFooter({ text: 'RPM' })],
    components: [buildBusinessButtons(accountId)],
    flags: 64,
  });
}

export async function handleBusinessWithdrawModal(interaction) {
  const accountId = interaction.customId.replace('business_do_withdraw_', '');
  const raw = interaction.fields.getTextInputValue('amount');
  const amount = parseInt(raw);
  if (isNaN(amount) || amount < 1) return interaction.reply({ embeds: [errorEmbed('Enter a valid amount.')], flags: 64 });
  const config = await getConfigOrFail(interaction);
  if (!config) return;
  const sym = config.currencySymbol;
  const account = await BusinessAccount.findOne({ accountId });
  if (!account) return interaction.reply({ embeds: [errorEmbed('Account not found.')], flags: 64 });
  if (account.balance < amount) return interaction.reply({ embeds: [errorEmbed(`The business only has ${sym}${fmt(account.balance)}.`)], flags: 64 });
  const bal = await getBalance(interaction.guildId, interaction.user.id, config.startingBalance);
  account.balance -= amount;
  bal.cash = Math.min(bal.cash + amount, config.maxBalance);
  await Promise.all([bal.save(), account.save(), logTx(account, 'withdraw', amount, interaction.user)]);
  return interaction.reply({
    embeds: [new EmbedBuilder().setColor('#2d2d2d').setTitle('Withdrawal Complete')
      .setDescription(`Withdrew ${sym}${fmt(amount)} from **${account.name}**.\n### Business Balance\n${sym}${fmt(account.balance)}\n### Your Cash\n${sym}${fmt(bal.cash)}`)
      .setFooter({ text: 'RPM' })],
    components: [buildBusinessButtons(accountId)],
    flags: 64,
  });
}

export async function runPayBusiness(interaction) {
  const config = await getConfigOrFail(interaction);
  if (!config) return;
  const sym = config.currencySymbol;
  const name = interaction.options.getString('name');
  const amount = interaction.options.getInteger('amount');
  const account = await BusinessAccount.findOne({ guildId: interaction.guildId, name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
  if (!account) return interaction.reply({ embeds: [errorEmbed(`No business account named **${name}** found.`)], flags: 64 });
  const bal = await getBalance(interaction.guildId, interaction.user.id, config.startingBalance);
  if (bal.cash < amount) return interaction.reply({ embeds: [errorEmbed(`You only have ${sym}${fmt(bal.cash)} in cash.`)], flags: 64 });
  bal.cash -= amount;
  account.balance += amount;
  await Promise.all([bal.save(), account.save(), logTx(account, 'pay', amount, interaction.user)]);
  return interaction.reply({
    embeds: [successEmbed('Payment Sent', `You paid ${sym}${fmt(amount)} to **${account.name}**.\n**Your Cash:** ${sym}${fmt(bal.cash)}`)],
    flags: 64,
  });
}
