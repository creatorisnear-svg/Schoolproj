import {
  ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ChannelSelectMenuBuilder, ChannelType, RoleSelectMenuBuilder,
  ButtonBuilder, ButtonStyle, PermissionFlagsBits,
} from 'discord.js';
import EconomyConfig from '../models/EconomyConfig.js';
import EconomyBalance from '../models/EconomyBalance.js';
import EconomyStore from '../models/EconomyStore.js';
import EconomyInventory from '../models/EconomyInventory.js';
import CivilianJobConfig from '../models/CivilianJobConfig.js';
import JobAssignment from '../models/JobAssignment.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';
import { GTA_VEHICLES } from '../data/gtaVehicles.js';
import { mergeShopItems } from './economyActions.js';

// ── Helpers ──────────────────────────────────────────────────────────────────
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

async function logTx(interaction, config, message) {
  if (!config?.logChannelId) return;
  try {
    const ch = interaction.guild.channels.cache.get(config.logChannelId);
    if (!ch?.isTextBased()) return;
    await ch.send({
      embeds: [new EmbedBuilder().setColor(0x2d2d2d)
        .setTitle('Economy - Admin Action')
        .setDescription(`**By:** ${interaction.user.username}\n${message}`)
        .setTimestamp().setFooter({ text: 'RPM' })],
    });
  } catch {}
}

function parseUserId(text) {
  const m = text?.trim().match(/^<@!?(\d+)>$/) || text?.trim().match(/^(\d+)$/);
  return m ? m[1] : null;
}

// ── Blackjack engine ──────────────────────────────────────────────────────────
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
function newDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ r, s });
  return d.sort(() => Math.random() - 0.5);
}
function cardValue(c) {
  if (['J','Q','K'].includes(c.r)) return 10;
  if (c.r === 'A') return 11;
  return parseInt(c.r);
}
function handTotal(hand) {
  let t = hand.reduce((s, c) => s + cardValue(c), 0);
  let aces = hand.filter(c => c.r === 'A').length;
  while (t > 21 && aces-- > 0) t -= 10;
  return t;
}
function handStr(hand) { return hand.map(c => `\`${c.r}${c.s}\``).join(' '); }

// ── Slots engine ──────────────────────────────────────────────────────────────
const SLOT_SYMS = ['CHR','LMN','ORG','GRP','STR','DMD'];
const SLOT_W    = [30, 25, 20, 15, 7, 3];
function spinSlot() {
  const r = Math.random() * 100; let acc = 0;
  for (let i = 0; i < SLOT_SYMS.length; i++) { acc += SLOT_W[i]; if (r < acc) return SLOT_SYMS[i]; }
  return SLOT_SYMS[0];
}
function slotMult(reels) {
  const [a,b,c] = reels;
  if (a===b && b===c) { if (a==='DMD') return 10; if (a==='STR') return 5; return 3; }
  if (a===b || b===c || a===c) return 1.5;
  return 0;
}

// ── Menu builders ─────────────────────────────────────────────────────────────
export function getEconomyMenu() {
  return {
    embeds: [new EmbedBuilder().setColor(0x2d2d2d).setTitle('Economy').setDescription('Select an action from the menu below.').setFooter({ text: 'RPM' })],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('economy_main_menu').setPlaceholder('Choose an action...')
          .addOptions([
            { label: 'Balance',      value: 'balance',      description: 'Check your cash and bank balance' },
            { label: 'Leaderboard',  value: 'leaderboard',  description: 'Top 10 richest members' },
            { label: 'Deposit',      value: 'deposit',      description: 'Deposit cash into your bank' },
            { label: 'Withdraw',     value: 'withdraw',     description: 'Withdraw cash from your bank' },
            { label: 'Give Money',   value: 'give',         description: 'Send cash to another member' },
            { label: 'Work',         value: 'work',         description: 'Work to earn money' },
            { label: 'Crime',        value: 'crime',        description: 'Commit a crime (risky)' },
            { label: 'Rob',          value: 'rob',          description: 'Rob another user' },
            { label: 'Income',       value: 'income',       description: 'Collect your role-based income' },
            { label: 'Store',        value: 'store',        description: 'Browse the server store' },
            { label: 'Inventory',    value: 'inventory',    description: 'View your inventory' },
            { label: 'Buy Item',     value: 'buy',          description: 'Purchase an item from the store' },
            { label: 'Sell Item',    value: 'sell',         description: 'Sell an item (50% value)' },
            { label: 'Use Item',     value: 'use',          description: 'Use an item from your inventory' },
            { label: 'Give Item',    value: 'giveitems',    description: 'Give an item to another member' },
            { label: 'Gambling',     value: 'gambling',     description: 'Play casino games' },
          ])
      ),
    ],
    flags: 64,
  };
}

export function getEconomySetupMenu() {
  return {
    embeds: [new EmbedBuilder().setColor(0x2d2d2d).setTitle('Economy Setup').setDescription('Configure the economy system. Select an option below.').setFooter({ text: 'RPM' })],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('economysetup_main_menu').setPlaceholder('Choose a setting...')
          .addOptions([
            { label: 'Toggle Economy On/Off',    value: 'toggle',              description: 'Enable or disable the economy system' },
            { label: 'View Config',              value: 'view',                description: 'See current economy settings' },
            { label: 'Currency Settings',        value: 'currency',            description: 'Symbol, starting balance, max' },
            { label: 'Work Settings',            value: 'work',                description: 'Configure the work command' },
            { label: 'Crime Settings',           value: 'crime',               description: 'Configure the crime command' },
            { label: 'Rob Settings',             value: 'rob',                 description: 'Configure the rob command' },
            { label: 'Gambling Settings',        value: 'gambling',            description: 'Configure gambling limits' },
            { label: 'Chat Money',               value: 'chatmoney',           description: 'Earn money by chatting' },
            { label: 'Role Income - Add',        value: 'roleincome',          description: 'Grant income to a role' },
            { label: 'Role Income - Remove',     value: 'removeroleincome',    description: 'Remove income from a role' },
            { label: 'Role Deduction - Add',     value: 'rolededuction',       description: 'Deduct money from a role on income collect' },
            { label: 'Role Deduction - Remove',  value: 'removerolededuction', description: 'Remove a deduction from a role' },
            { label: 'Store - Add Item',         value: 'storeadd',            description: 'Add an item to the store' },
            { label: 'Store - Remove Item',      value: 'storeremove',         description: 'Remove an item from the store' },
            { label: 'Store - Edit Item',        value: 'storeedit',           description: 'Edit an existing store item' },
            { label: 'Store - View All',         value: 'storelist',           description: 'See all store items' },
            { label: 'Add Money',                value: 'addmoney',            description: 'Add money to a user' },
            { label: 'Remove Money',             value: 'removemoney',         description: 'Remove money from a user' },
            { label: 'Reset Balance',            value: 'resetmoney',          description: "Reset a user's balance" },
            { label: 'Set Log Channel',          value: 'setlogchannel',       description: 'Economy transaction log channel' },
            { label: 'Sell Settings',            value: 'sellsettings',        description: 'Set sell-back % members get when selling items' },
            { label: 'Income Tax',               value: 'incometax',           description: 'Set tax rate deducted from income (%)' },
            { label: 'Income Board',             value: 'incomeboard',         description: 'Post income redemption embed to a channel' },
            { label: 'Civilian Jobs',            value: 'civilian_jobs',       description: 'Manage the civilian jobs assignment panel' },
            { label: 'Done',                     value: 'done',                description: 'Close this menu' },
          ])
      ),
    ],
    flags: 64,
  };
}

function gamblingMenu() {
  return {
    embeds: [new EmbedBuilder().setColor(0x2d2d2d).setTitle('Gambling').setDescription('Pick a game to play.').setFooter({ text: 'RPM' })],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('economy_gambling_menu').setPlaceholder('Choose a game...')
          .addOptions([
            { label: 'Blackjack',        value: 'blackjack',       description: 'Play a hand of blackjack' },
            { label: 'Roulette',         value: 'roulette',        description: 'Spin the wheel (red/black/green)' },
            { label: 'Slots',            value: 'slots',           description: 'Pull the slot machine' },
            { label: 'Dice Roll',        value: 'roll',            description: 'Roll dice - higher wins' },
            { label: 'Russian Roulette', value: 'russianroulette', description: '1/6 chance of losing all cash' },
            { label: 'Cock Fight',       value: 'cockfight',       description: '50/50 for 1.8x payout' },
            { label: 'Back',             value: 'back',            description: 'Return to economy menu' },
          ])
      ),
    ],
    flags: 64,
  };
}

function backBtn(type = 'economy') {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(type === 'setup' ? 'economysetup_back_to_main' : 'economy_back_to_main')
      .setLabel(type === 'setup' ? '← Setup Menu' : '← Economy Menu')
      .setStyle(ButtonStyle.Secondary)
  );
}

function civJobsSetupMenu(config) {
  const jobs = config?.jobs || [];
  const jobList = jobs.length
    ? jobs.map((j, i) => `**${i + 1}.** ${j.name} - <@&${j.roleId}> · ${j.durationHours}h`).join('\n')
    : 'No jobs added yet.';
  return {
    embeds: [new EmbedBuilder().setColor(0x2d2d2d)
      .setTitle('Civilian Jobs Setup')
      .setDescription(
        `**Channel:** ${config?.channelId ? `<#${config.channelId}>` : 'Not set'}\n**Jobs:** ${jobs.length}\n\n${jobList}`
      )
      .setFooter({ text: 'RPM' })],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('economy_civjobs_setup_menu').setPlaceholder('Choose an action...')
          .addOptions([
            { label: 'Set Jobs Channel',    value: 'set_channel',  description: 'Channel where the jobs panel will be posted' },
            { label: 'Add Job',             value: 'add_job',      description: 'Add a new civilian job to the panel' },
            { label: 'Remove Job',          value: 'remove_job',   description: 'Remove an existing job from the panel' },
            { label: 'Post / Update Panel', value: 'post_panel',   description: 'Send or refresh the jobs panel now' },
            { label: '← Back to Setup',    value: 'back',         description: 'Return to economy setup menu' },
          ])
      ),
    ],
    content: '',
  };
}

function buildStoreMenu(items, sym, mode, query = null) {
  const customId = mode === 'buy' ? 'economy_buy_item_select' : 'economy_store_browse_menu';
  const opts = [
    { label: 'Search items...', value: '__search__', description: 'Filter items by name' },
  ];
  const displayed = query
    ? items.filter(i => i.name.toLowerCase().includes(query.toLowerCase()))
    : items;
  displayed.slice(0, 23).forEach(item => {
    const label = `${item.name} - ${sym}${fmt(item.price)}`;
    opts.push({
      label: label.slice(0, 100),
      value: String(item._id),
      description: (item.description || 'No description').slice(0, 100),
    });
  });
  opts.push({ label: '← Back to Economy', value: '__back__', description: 'Return to economy menu' });
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder('Select an item...').addOptions(opts)
  );
}

// ── Select menu handler ────────────────────────────────────────────────────────
export async function handleEconomyMenu(interaction) {
  const guildId = interaction.guildId;
  const userId  = interaction.user.id;

  // ── economy_main_menu ────────────────────────────────────────────────────
  if (interaction.customId === 'economy_main_menu') {
    const value = interaction.values[0];

    if (value === 'gambling') return interaction.update(gamblingMenu());

    const config = await getConfig(guildId);
    if (!config?.enabled) {
      return interaction.update({ embeds: [errorEmbed('The economy system is not enabled on this server.')], components: [], content: '' });
    }
    const sym = config.currencySymbol;
    const bal = await getBalance(guildId, userId, config.startingBalance);

    if (value === 'balance') {
      return interaction.update({
        embeds: [new EmbedBuilder().setColor(0x2d2d2d)
          .setTitle(`${interaction.user.username}'s Balance`)
          .setDescription(`**Cash:** ${sym}${fmt(bal.cash)}\n**Bank:** ${sym}${fmt(bal.bank)}\n**Total:** ${sym}${fmt(bal.cash + bal.bank)}`)
          .setFooter({ text: 'RPM' })],
        components: [backBtn()], content: '',
      });
    }

    if (value === 'leaderboard') {
      const top = await EconomyBalance.find({ guildId }).limit(20);
      const sorted = top.sort((a, b) => (b.cash + b.bank) - (a.cash + a.bank));
      const lines = sorted.slice(0, 10).map((e, i) => `**${i + 1}.** <@${e.userId}> - ${sym}${fmt(e.cash + e.bank)}`);
      return interaction.update({
        embeds: [new EmbedBuilder().setColor(0x2d2d2d).setTitle('Economy Leaderboard').setDescription(lines.join('\n') || 'No data yet.').setFooter({ text: 'RPM' })],
        components: [backBtn()], content: '',
      });
    }

    if (value === 'work') {
      if (!config.work.enabled) return interaction.update({ embeds: [errorEmbed('Work is disabled on this server.')], components: [backBtn()], content: '' });
      if (!hasPermission(interaction.member, config.permissions?.workRoles)) return interaction.update({ embeds: [errorEmbed('You do not have the required role to work.')], components: [backBtn()], content: '' });
      const rem = cooldownRemaining(bal.workCooldown, config.work.cooldown);
      if (rem > 0) return interaction.update({ embeds: [errorEmbed(`You can work again in **${formatMs(rem)}**.`)], components: [backBtn()], content: '' });
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
      ];
      const replies = config.work.customReplies?.length > 0
        ? config.work.customReplies.map(r => r.replace('{amount}', `${sym}${fmt(pay)}`))
        : defaults;
      return interaction.update({ embeds: [successEmbed('Work Complete', `${replies[Math.floor(Math.random() * replies.length)]}\n-# Next work: ${formatMs(config.work.cooldown * 60 * 1000)}`)], components: [backBtn()], content: '' });
    }

    if (value === 'crime') {
      if (!config.crime.enabled) return interaction.update({ embeds: [errorEmbed('Crime is disabled on this server.')], components: [backBtn()], content: '' });
      if (!hasPermission(interaction.member, config.permissions?.crimeRoles)) return interaction.update({ embeds: [errorEmbed('You do not have the required role to commit crimes.')], components: [backBtn()], content: '' });
      const rem = cooldownRemaining(bal.crimeCooldown, config.crime.cooldown);
      if (rem > 0) return interaction.update({ embeds: [errorEmbed(`You can commit a crime again in **${formatMs(rem)}**.`)], components: [backBtn()], content: '' });
      bal.crimeCooldown = new Date();
      const success = Math.random() * 100 < config.crime.successRate;
      if (success) {
        const pay = Math.floor(Math.random() * (config.crime.maxPayout - config.crime.minPayout + 1)) + config.crime.minPayout;
        bal.cash = Math.min(bal.cash + pay, config.maxBalance);
        await bal.save();
        const defaults = [
          `You robbed a convenience store and got away with ${sym}${fmt(pay)}.`,
          `You hacked into a corporate account and siphoned ${sym}${fmt(pay)}.`,
          `You pickpocketed tourists and pocketed ${sym}${fmt(pay)}.`,
          `You boosted a car and sold it for ${sym}${fmt(pay)}.`,
        ];
        const replies = config.crime.customReplies?.length > 0
          ? config.crime.customReplies.map(r => r.replace('{amount}', `${sym}${fmt(pay)}`))
          : defaults;
        return interaction.update({ embeds: [successEmbed('Crime Successful', `${replies[Math.floor(Math.random() * replies.length)]}\n-# Next crime: ${formatMs(config.crime.cooldown * 60 * 1000)}`)], components: [backBtn()], content: '' });
      } else {
        const fine = Math.floor(config.crime.maxPayout * (config.crime.fineRate / 100));
        bal.cash = Math.max(0, bal.cash - fine);
        await bal.save();
        return interaction.update({ embeds: [{ color: 0xf04747, title: 'Crime Failed', description: `You got caught and paid a fine of **${sym}${fmt(fine)}**.\n-# Next crime: ${formatMs(config.crime.cooldown * 60 * 1000)}`, footer: { text: 'RPM' } }], components: [backBtn()], content: '' });
      }
    }

    if (value === 'income') {
      if (!config.roleIncome?.length) return interaction.update({ embeds: [errorEmbed('No role income is configured on this server.')], components: [backBtn()], content: '' });
      const memberRoleIds = interaction.member.roles.cache.map(r => r.id);
      const eligible = config.roleIncome.filter(ri => memberRoleIds.includes(ri.roleId));
      if (!eligible.length) return interaction.update({ embeds: [errorEmbed('You do not have any roles with income configured.')], components: [backBtn()], content: '' });
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
      return interaction.update({ embeds: [new EmbedBuilder().setColor(totalEarned > 0 ? 0x43b581 : 0x2d2d2d).setTitle('Role Income').setDescription(desc).setFooter({ text: 'RPM' })], components: [backBtn()], content: '' });
    }

    if (value === 'store') {
      const items = await EconomyStore.find({ guildId });
      if (!items.length) return interaction.update({ embeds: [errorEmbed('The store has no items yet.')], components: [backBtn()], content: '' });
      return interaction.update({
        embeds: [new EmbedBuilder().setColor(0x2d2d2d).setTitle('Server Store').setDescription(`**${items.length}** item${items.length !== 1 ? 's' : ''} available.\nSelect an item to view its details.`).setFooter({ text: 'RPM' })],
        components: [buildStoreMenu(items, sym, 'browse')],
        content: '',
      });
    }

    if (value === 'inventory') {
      const inv = await EconomyInventory.findOne({ guildId, userId });
      if (!inv?.items?.length) return interaction.update({ embeds: [errorEmbed('Your inventory is empty.')], components: [backBtn()], content: '' });
      return interaction.update({ embeds: [new EmbedBuilder().setColor(0x2d2d2d).setTitle(`${interaction.user.username}'s Inventory`).setDescription(inv.items.map(i => `**${i.itemName}** x${i.quantity}`).join('\n')).setFooter({ text: 'RPM' })], components: [backBtn()], content: '' });
    }

    if (value === 'buy') {
      const items = await EconomyStore.find({ guildId });
      if (!items.length) return interaction.update({ embeds: [errorEmbed('The store has no items yet.')], components: [backBtn()], content: '' });
      return interaction.update({
        embeds: [new EmbedBuilder().setColor(0x2d2d2d).setTitle('Buy Item').setDescription(`Select an item to purchase. You have **${sym}${fmt(bal.cash)}** in cash.`).setFooter({ text: 'RPM' })],
        components: [buildStoreMenu(items, sym, 'buy')],
        content: '',
      });
    }

    // Modal-based actions
    const modals = {
      deposit:   { id: 'economy_deposit_modal',   title: 'Deposit Cash',   fields: [{ id: 'amount', label: 'Amount (or "all")', placeholder: 'e.g. 500 or all' }] },
      withdraw:  { id: 'economy_withdraw_modal',  title: 'Withdraw Cash',  fields: [{ id: 'amount', label: 'Amount (or "all")', placeholder: 'e.g. 500 or all' }] },
      give:      { id: 'economy_give_modal',      title: 'Give Money',     fields: [{ id: 'user_id', label: 'User ID or @mention', placeholder: '123456789012345678' }, { id: 'amount', label: 'Amount', placeholder: 'e.g. 500' }] },
      rob:       { id: 'economy_rob_modal',       title: 'Rob a User',     fields: [{ id: 'user_id', label: 'Target User ID or @mention', placeholder: '123456789012345678' }] },
      sell:      { id: 'economy_sell_modal',      title: 'Sell Item',      fields: [{ id: 'item', label: 'Item Name', placeholder: 'e.g. Health Pack' }, { id: 'quantity', label: 'Quantity', placeholder: 'Default: 1', required: false }] },
      use:       { id: 'economy_use_modal',       title: 'Use Item',       fields: [{ id: 'item', label: 'Item Name', placeholder: 'e.g. Health Pack' }] },
      giveitems: { id: 'economy_giveitems_modal', title: 'Give Item',      fields: [{ id: 'user_id', label: 'User ID or @mention', placeholder: '123456789012345678' }, { id: 'item', label: 'Item Name', placeholder: 'e.g. Health Pack' }, { id: 'quantity', label: 'Quantity', placeholder: 'Default: 1', required: false }] },
    };
    const mc = modals[value];
    if (mc) {
      const modal = new ModalBuilder().setCustomId(mc.id).setTitle(mc.title);
      modal.addComponents(...mc.fields.map(f =>
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId(f.id).setLabel(f.label).setStyle(TextInputStyle.Short)
            .setRequired(f.required !== false).setPlaceholder(f.placeholder || '')
        )
      ));
      return interaction.showModal(modal);
    }
  }

  // ── economy_store_browse_menu ─────────────────────────────────────────────
  if (interaction.customId === 'economy_store_browse_menu') {
    const value = interaction.values[0];
    if (value === '__back__') return interaction.update(getEconomyMenu());
    if (value === '__search__') {
      const modal = new ModalBuilder().setCustomId('economy_store_search_browse_modal').setTitle('Search Store');
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('query').setLabel('Search for...').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('e.g. health')));
      return interaction.showModal(modal);
    }
    const config = await getConfig(guildId);
    const sym = config?.currencySymbol || '$';
    const item = await EconomyStore.findById(value).catch(() => null);
    if (!item) return interaction.update({ embeds: [errorEmbed('Item not found.')], components: [backBtn()], content: '' });
    const embed = new EmbedBuilder().setColor(0x2d2d2d).setTitle(item.name)
      .addFields(
        { name: 'Price', value: `${sym}${fmt(item.price)}`, inline: true },
        { name: 'Usable', value: item.usable ? 'Yes' : 'No', inline: true },
      )
      .setDescription(item.description || 'No description.')
      .setFooter({ text: 'RPM' });
    const buyLabel = `Buy ${item.name}`.slice(0, 80);
    return interaction.update({
      embeds: [embed],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`economy_buy_now_${item._id}`).setLabel(buyLabel).setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('economy_back_to_store').setLabel('← Back to Store').setStyle(ButtonStyle.Secondary),
        ),
      ],
      content: '',
    });
  }

  // ── economy_buy_item_select ───────────────────────────────────────────────
  if (interaction.customId === 'economy_buy_item_select') {
    const value = interaction.values[0];
    if (value === '__back__') return interaction.update(getEconomyMenu());
    if (value === '__search__') {
      const modal = new ModalBuilder().setCustomId('economy_store_search_buy_modal').setTitle('Search Store');
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('query').setLabel('Search for...').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('e.g. health')));
      return interaction.showModal(modal);
    }
    const config = await getConfig(guildId);
    const sym = config?.currencySymbol || '$';
    const item = await EconomyStore.findById(value).catch(() => null);
    if (!item) return interaction.update({ embeds: [errorEmbed('Item not found.')], components: [backBtn()], content: '' });
    const modal = new ModalBuilder().setCustomId(`economy_buy_qty_${item._id}_modal`).setTitle(`Buy ${item.name}`);
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('quantity').setLabel(`Quantity - ${sym}${fmt(item.price)} each`).setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('e.g. 1'))
    );
    return interaction.showModal(modal);
  }

  // ── economy_gambling_menu ─────────────────────────────────────────────────
  if (interaction.customId === 'economy_gambling_menu') {
    const value = interaction.values[0];
    if (value === 'back') return interaction.update(getEconomyMenu());

    const config = await getConfig(guildId);
    if (!config?.enabled) return interaction.update({ embeds: [errorEmbed('Economy is not enabled.')], components: [], content: '' });
    if (!config.gambling.enabled) return interaction.update({ embeds: [errorEmbed('Gambling is disabled on this server.')], components: [backBtn()], content: '' });

    if (value === 'roulette') {
      const modal = new ModalBuilder().setCustomId('economy_roulette_modal').setTitle('Roulette');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('bet').setLabel('Bet Amount').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder(`Min: ${config.gambling.minBet}`)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('choice').setLabel('Choice: red, black, or green').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('red'))
      );
      return interaction.showModal(modal);
    }

    const gameTitle = { blackjack: 'Blackjack', slots: 'Slots', roll: 'Dice Roll', russianroulette: 'Russian Roulette', cockfight: 'Cock Fight' }[value] || value;
    const modal = new ModalBuilder().setCustomId(`economy_gamble_${value}_modal`).setTitle(gameTitle);
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('bet').setLabel('Bet Amount').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder(`Min: ${config.gambling.minBet}`))
    );
    return interaction.showModal(modal);
  }

  // ── economysetup_main_menu ─────────────────────────────────────────────────
  if (interaction.customId === 'economysetup_main_menu') {
    if (!await checkStaffPermission(interaction)) {
      return interaction.update({ embeds: [errorEmbed('You do not have permission to use this.')], components: [], content: '' });
    }
    const value = interaction.values[0];
    let config = await getConfig(guildId);
    if (!config) config = new EconomyConfig({ guildId });
    const sym = config.currencySymbol || '$';

    if (value === 'done') return interaction.update({ embeds: [successEmbed('Done', 'Economy setup closed.')], components: [], content: '' });

    if (value === 'enable' || value === 'disable' || value === 'toggle') {
      const hasPerm = interaction.member.permissions.has(PermissionFlagsBits.Administrator) || interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);
      if (!hasPerm) return interaction.update({ embeds: [errorEmbed('You need Administrator or Manage Server permission.')], components: [backBtn('setup')], content: '' });
      if (value === 'toggle') config.enabled = !config.enabled;
      else config.enabled = value === 'enable';
      await config.save();
      const nowState = config.enabled ? 'enabled' : 'disabled';
      return interaction.update({ embeds: [successEmbed(`Economy ${config.enabled ? 'Enabled' : 'Disabled'}`, `The economy system is now **${nowState}**.`)], components: [backBtn('setup')], content: '' });
    }

    if (value === 'view') {
      const desc =
        `### Status\n**Enabled:** ${config.enabled ? 'Yes' : 'No'}\n\n` +
        `### Currency\n**Symbol:** ${sym}  **Starting:** ${sym}${config.startingBalance}  **Max:** ${sym}${config.maxBalance}\n\n` +
        `### Work\n**Enabled:** ${config.work.enabled}  **Cooldown:** ${config.work.cooldown}m  **Pay:** ${sym}${config.work.minPayout}–${sym}${config.work.maxPayout}\n\n` +
        `### Crime\n**Enabled:** ${config.crime.enabled}  **Cooldown:** ${config.crime.cooldown}m  **Success:** ${config.crime.successRate}%\n\n` +
        `### Rob\n**Enabled:** ${config.rob.enabled}  **Cooldown:** ${config.rob.cooldown}m  **Success:** ${config.rob.successRate}%\n\n` +
        `### Gambling\n**Enabled:** ${config.gambling.enabled}  **Bet:** ${sym}${config.gambling.minBet}–${sym}${config.gambling.maxBet}\n\n` +
        `### Chat Money\n**Enabled:** ${config.chatMoney.enabled}  **Amount:** ${sym}${config.chatMoney.minAmount}–${sym}${config.chatMoney.maxAmount}  **Cooldown:** ${config.chatMoney.cooldown}s\n\n` +
        `### Role Income\n${config.roleIncome.length ? config.roleIncome.map(r => `<@&${r.roleId}>: ${sym}${r.amount} every ${r.cooldown}h`).join('\n') : 'None configured.'}\n\n` +
        `### Role Deductions\n${(config.roleDeductions || []).length ? config.roleDeductions.map(r => `<@&${r.roleId}>: -${sym}${r.amount} every ${r.cooldown}h (${r.label})`).join('\n') : 'None configured.'}\n\n` +
        `### Income Tax\n**Rate:** ${config.incomeTax || 0}%${config.incomeChannelId ? `  **Board Channel:** <#${config.incomeChannelId}>` : ''}`;
      return interaction.update({ embeds: [{ color: 0x2d2d2d, title: 'Economy Config', description: desc, footer: { text: 'RPM' } }], components: [backBtn('setup')], content: '' });
    }

    if (value === 'storelist') {
      const items = await EconomyStore.find({ guildId });
      if (!items.length) return interaction.update({ embeds: [errorEmbed('No items in the store.')], components: [backBtn('setup')], content: '' });
      const desc = items.map((item, i) => `**${i + 1}. ${item.name}** - ${sym}${fmt(item.price)}\n-# ${item.description}${item.usable ? ' *(usable)*' : ''}`).join('\n\n');
      return interaction.update({ embeds: [new EmbedBuilder().setColor(0x2d2d2d).setTitle('Store Items').setDescription(desc).setFooter({ text: 'RPM' })], components: [backBtn('setup')], content: '' });
    }

    if (value === 'setlogchannel') {
      return interaction.update({
        embeds: [new EmbedBuilder().setColor(0x2d2d2d).setTitle('Set Log Channel').setDescription('Select the channel for economy transaction logs.').setFooter({ text: 'RPM' })],
        components: [new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('economy_log_channel_select').setPlaceholder('Select a text channel...').setChannelTypes(ChannelType.GuildText))],
        content: '',
      });
    }

    if (value === 'incomeboard') {
      return interaction.update({
        embeds: [new EmbedBuilder().setColor(0x2d2d2d).setTitle('Income Board').setDescription('Select the channel where the income redemption embed will be posted.\n\nMembers will be able to click a button to collect their income directly from that channel.').setFooter({ text: 'RPM' })],
        components: [new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('economy_incomeboard_channel_select').setPlaceholder('Select a text channel...').setChannelTypes(ChannelType.GuildText))],
        content: '',
      });
    }

    if (value === 'civilian_jobs') {
      const jobConfig = await CivilianJobConfig.findOne({ guildId });
      return interaction.update(civJobsSetupMenu(jobConfig));
    }

    if (value === 'roleincome') {
      return interaction.update({
        embeds: [new EmbedBuilder().setColor(0x2d2d2d).setTitle('Role Income - Select Role').setDescription('Pick the role that will receive income.').setFooter({ text: 'RPM' })],
        components: [new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('economy_roleincome_role_select').setPlaceholder('Select a role...'))],
        content: '',
      });
    }

    if (value === 'removeroleincome') {
      return interaction.update({
        embeds: [new EmbedBuilder().setColor(0x2d2d2d).setTitle('Role Income - Remove').setDescription('Pick the role to remove income from.').setFooter({ text: 'RPM' })],
        components: [new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('economy_removeroleincome_role_select').setPlaceholder('Select a role...'))],
        content: '',
      });
    }

    if (value === 'rolededuction') {
      return interaction.update({
        embeds: [new EmbedBuilder().setColor(0x2d2d2d).setTitle('Role Deduction - Add').setDescription('Select the role that will have money deducted when members collect income.').setFooter({ text: 'RPM' })],
        components: [new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('economy_rolededuction_role_select').setPlaceholder('Select a role...'))],
        content: '',
      });
    }

    if (value === 'removerolededuction') {
      return interaction.update({
        embeds: [new EmbedBuilder().setColor(0x2d2d2d).setTitle('Role Deduction - Remove').setDescription('Pick the role to remove the deduction from.').setFooter({ text: 'RPM' })],
        components: [new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('economy_removerolededuction_role_select').setPlaceholder('Select a role...'))],
        content: '',
      });
    }

    // Modal-based setup actions
    const setupModals = {
      currency:  { title: 'Currency Settings',  id: 'economysetup_currency_modal',  fields: [{ id: 'symbol',      label: 'Currency Symbol (e.g. $ or #)', val: config.currencySymbol }, { id: 'starting', label: 'Starting Balance', val: String(config.startingBalance) }, { id: 'max', label: 'Max Balance', val: String(config.maxBalance) }] },
      work:      { title: 'Work Settings',       id: 'economysetup_work_modal',      fields: [{ id: 'enabled',     label: 'Enabled? (yes/no)',            val: config.work.enabled ? 'yes' : 'no' }, { id: 'cooldown', label: 'Cooldown (minutes)', val: String(config.work.cooldown) }, { id: 'minpay', label: 'Min Payout', val: String(config.work.minPayout) }, { id: 'maxpay', label: 'Max Payout', val: String(config.work.maxPayout) }] },
      crime:     { title: 'Crime Settings',      id: 'economysetup_crime_modal',     fields: [{ id: 'enabled',     label: 'Enabled? (yes/no)',            val: config.crime.enabled ? 'yes' : 'no' }, { id: 'cooldown', label: 'Cooldown (minutes)', val: String(config.crime.cooldown) }, { id: 'successrate', label: 'Success Rate % (1-100)', val: String(config.crime.successRate) }, { id: 'minpay', label: 'Min Payout', val: String(config.crime.minPayout) }, { id: 'maxpay', label: 'Max Payout', val: String(config.crime.maxPayout) }] },
      rob:       { title: 'Rob Settings',        id: 'economysetup_rob_modal',       fields: [{ id: 'enabled',     label: 'Enabled? (yes/no)',            val: config.rob.enabled ? 'yes' : 'no' }, { id: 'cooldown', label: 'Cooldown (minutes)', val: String(config.rob.cooldown) }, { id: 'successrate', label: 'Success Rate % (1-100)', val: String(config.rob.successRate) }, { id: 'maxsteal', label: 'Max Steal % of target cash', val: String(config.rob.maxStealPercent) }] },
      gambling:  { title: 'Gambling Settings',   id: 'economysetup_gambling_modal',  fields: [{ id: 'enabled',     label: 'Enabled? (yes/no)',            val: config.gambling.enabled ? 'yes' : 'no' }, { id: 'minbet', label: 'Minimum Bet', val: String(config.gambling.minBet) }, { id: 'maxbet', label: 'Maximum Bet', val: String(config.gambling.maxBet) }, { id: 'cooldown', label: 'Cooldown (minutes)', val: String(config.gambling.cooldown) }] },
      chatmoney: { title: 'Chat Money Settings', id: 'economysetup_chatmoney_modal', fields: [{ id: 'enabled',     label: 'Enabled? (yes/no)',            val: config.chatMoney.enabled ? 'yes' : 'no' }, { id: 'min', label: 'Min per message', val: String(config.chatMoney.minAmount) }, { id: 'max', label: 'Max per message', val: String(config.chatMoney.maxAmount) }, { id: 'cooldown', label: 'Cooldown (seconds)', val: String(config.chatMoney.cooldown) }] },
      incometax:    { title: 'Income Tax',       id: 'economysetup_incometax_modal',    fields: [{ id: 'rate', label: 'Tax Rate % (0 = disabled)', val: String(config.incomeTax || 0) }] },
      sellsettings: { title: 'Sell Settings',   id: 'economysetup_sellsettings_modal', fields: [{ id: 'percent', label: 'Sell-Back % (0–100, default 50)', val: String(config.sellPercent ?? 50) }] },
      storeadd:  { title: 'Add Store Item',      id: 'economysetup_storeadd_modal',  fields: [{ id: 'name', label: 'Item Name', val: '' }, { id: 'price', label: 'Price', val: '' }, { id: 'description', label: 'Description', val: '', style: TextInputStyle.Paragraph }] },
      storeremove: null,
      storeedit: null,
      addmoney:  { title: 'Add Money',           id: 'economysetup_addmoney_modal',  fields: [{ id: 'user_id', label: 'User ID or @mention', val: '' }, { id: 'amount', label: 'Amount', val: '' }] },
      removemoney: { title: 'Remove Money',      id: 'economysetup_removemoney_modal', fields: [{ id: 'user_id', label: 'User ID or @mention', val: '' }, { id: 'amount', label: 'Amount', val: '' }] },
      resetmoney: { title: 'Reset Balance',      id: 'economysetup_resetmoney_modal', fields: [{ id: 'user_id', label: 'User ID or @mention', val: '' }] },
    };
    if (value === 'storeremove' || value === 'storeedit') {
      const items = await EconomyStore.find({ guildId });
      if (!items.length) return interaction.update({ embeds: [errorEmbed('There are no items in the store to ' + (value === 'storeremove' ? 'remove' : 'edit') + '.')], components: [backBtn('setup')], content: '' });
      const action = value === 'storeremove' ? 'remove' : 'edit';
      const customId = value === 'storeremove' ? 'economysetup_storeremove_select' : 'economysetup_storeedit_select';
      const opts = items.slice(0, 25).map(item => ({
        label: item.name.slice(0, 100),
        value: String(item._id),
        description: `${sym}${fmt(item.price)} - ${(item.description || 'No description').slice(0, 80)}`,
      }));
      return interaction.update({
        embeds: [new EmbedBuilder().setColor(0x2d2d2d)
          .setTitle(value === 'storeremove' ? 'Remove Store Item' : 'Edit Store Item')
          .setDescription(`Select an item to ${action}. Showing **${items.length}** item${items.length !== 1 ? 's' : ''}.`)
          .setFooter({ text: 'RPM' })],
        components: [
          new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder(`Choose an item to ${action}...`).addOptions(opts)
          ),
        ],
        content: '',
      });
    }

    const sm = setupModals[value];
    if (sm) {
      const modal = new ModalBuilder().setCustomId(sm.id).setTitle(sm.title);
      modal.addComponents(...sm.fields.map(f =>
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId(f.id).setLabel(f.label).setStyle(f.style || TextInputStyle.Short)
            .setRequired(f.required !== false).setPlaceholder(f.val || '').setValue(f.val || '')
        )
      ));
      return interaction.showModal(modal);
    }
  }

  // ── Role / Channel follow-up selects ─────────────────────────────────────
  if (interaction.customId === 'economy_roleincome_role_select') {
    const role = interaction.roles.first();
    if (!role) return interaction.update({ embeds: [errorEmbed('No role selected.')], components: [backBtn('setup')], content: '' });
    const modal = new ModalBuilder().setCustomId(`economysetup_roleincome_modal_${role.id}`).setTitle('Role Income');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('amount').setLabel('Income Amount').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('e.g. 500')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cooldown').setLabel('Cooldown (hours)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('e.g. 24'))
    );
    return interaction.showModal(modal);
  }

  if (interaction.customId === 'economy_removeroleincome_role_select') {
    const role = interaction.roles.first();
    if (!role) return interaction.update({ embeds: [errorEmbed('No role selected.')], components: [backBtn('setup')], content: '' });
    const config = await getConfig(guildId) || new EconomyConfig({ guildId });
    config.roleIncome = config.roleIncome.filter(r => r.roleId !== role.id);
    config.markModified('roleIncome');
    await config.save();
    return interaction.update({ embeds: [successEmbed('Role Income Removed', `Income removed for ${role}.`)], components: [backBtn('setup')], content: '' });
  }

  if (interaction.customId === 'economy_rolededuction_role_select') {
    const role = interaction.roles.first();
    if (!role) return interaction.update({ embeds: [errorEmbed('No role selected.')], components: [backBtn('setup')], content: '' });
    const modal = new ModalBuilder().setCustomId(`economysetup_rolededuction_modal_${role.id}`).setTitle('Role Deduction');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('label').setLabel('Deduction Label (e.g. Government Tax)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('e.g. Government Tax')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('amount').setLabel('Deduction Amount').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('e.g. 200')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cooldown').setLabel('Cooldown (hours)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('e.g. 24'))
    );
    return interaction.showModal(modal);
  }

  if (interaction.customId === 'economy_removerolededuction_role_select') {
    const role = interaction.roles.first();
    if (!role) return interaction.update({ embeds: [errorEmbed('No role selected.')], components: [backBtn('setup')], content: '' });
    const config = await getConfig(guildId) || new EconomyConfig({ guildId });
    config.roleDeductions = (config.roleDeductions || []).filter(r => r.roleId !== role.id);
    config.markModified('roleDeductions');
    await config.save();
    return interaction.update({ embeds: [successEmbed('Role Deduction Removed', `Deduction removed for ${role}.`)], components: [backBtn('setup')], content: '' });
  }

  if (interaction.customId === 'economy_log_channel_select') {
    const channel = interaction.channels.first();
    if (!channel) return interaction.update({ embeds: [errorEmbed('No channel selected.')], components: [backBtn('setup')], content: '' });
    const config = await getConfig(guildId) || new EconomyConfig({ guildId });
    config.logChannelId = channel.id;
    await config.save();
    return interaction.update({ embeds: [successEmbed('Log Channel Set', `Economy logs will be sent to ${channel}.`)], components: [backBtn('setup')], content: '' });
  }

  if (interaction.customId === 'economy_incomeboard_channel_select') {
    const channel = interaction.channels.first();
    if (!channel) return interaction.update({ embeds: [errorEmbed('No channel selected.')], components: [backBtn('setup')], content: '' });
    const config = await getConfig(guildId) || new EconomyConfig({ guildId });
    config.incomeChannelId = channel.id;
    config.incomeMessageId = null;
    await config.save();
    await postIncomeBoard(interaction.guild, config);
    return interaction.update({ embeds: [successEmbed('Income Panel Sent', `Income collection panel posted to ${channel}.\n\nMembers can click the button there to claim their income and see any deductions applied.`)], components: [backBtn('setup')], content: '' });
  }

  // ── Civilian Jobs setup sub-menu ──────────────────────────────────────────
  if (interaction.customId === 'economy_civjobs_setup_menu') {
    if (!await checkStaffPermission(interaction)) {
      return interaction.update({ embeds: [errorEmbed('You do not have permission.')], components: [], content: '' });
    }
    const value = interaction.values[0];
    if (value === 'back') return interaction.update(getEconomySetupMenu());
    let jobConfig = await CivilianJobConfig.findOne({ guildId });
    if (!jobConfig) jobConfig = new CivilianJobConfig({ guildId });

    if (value === 'set_channel') {
      return interaction.update({
        embeds: [new EmbedBuilder().setColor(0x2d2d2d).setTitle('Civilian Jobs - Set Channel').setDescription('Select the channel where the civilian jobs panel will be posted.').setFooter({ text: 'RPM' })],
        components: [new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('economy_civjobs_channel_select').setPlaceholder('Select a text channel...').setChannelTypes(ChannelType.GuildText))],
        content: '',
      });
    }

    if (value === 'add_job') {
      return interaction.update({
        embeds: [new EmbedBuilder().setColor(0x2d2d2d).setTitle('Add Civilian Job - Select Role').setDescription('Pick the role members will receive when they take this job.').setFooter({ text: 'RPM' })],
        components: [new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('economy_civjobs_addjob_role_select').setPlaceholder('Select a role...'))],
        content: '',
      });
    }

    if (value === 'remove_job') {
      if (!jobConfig.jobs?.length) return interaction.update({ embeds: [errorEmbed('No jobs to remove.')], components: [backBtn('setup')], content: '' });
      const opts = jobConfig.jobs.slice(0, 25).map(j => ({
        label: j.name.slice(0, 100),
        value: j.jobId,
        description: `Role: ${j.roleId} · Expires: ${j.durationHours}h`,
      }));
      return interaction.update({
        embeds: [new EmbedBuilder().setColor(0x2d2d2d).setTitle('Remove Civilian Job').setDescription('Select the job to remove from the panel.').setFooter({ text: 'RPM' })],
        components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('economy_civjobs_removejob_select').setPlaceholder('Select a job...').addOptions(opts))],
        content: '',
      });
    }

    if (value === 'post_panel') {
      if (!jobConfig.channelId) return interaction.update({ embeds: [errorEmbed('Set a jobs channel first using "Set Jobs Channel".')], components: [backBtn('setup')], content: '' });
      if (!jobConfig.jobs?.length) return interaction.update({ embeds: [errorEmbed('Add at least one job before posting the panel.')], components: [backBtn('setup')], content: '' });
      await postCivilianJobsPanel(interaction.guild, jobConfig);
      const ch = interaction.guild.channels.cache.get(jobConfig.channelId);
      return interaction.update({ embeds: [successEmbed('Panel Updated', `Civilian jobs panel posted${ch ? ` in ${ch}` : ''}.`)], components: [backBtn('setup')], content: '' });
    }
  }

  if (interaction.customId === 'economy_civjobs_channel_select') {
    const channel = interaction.channels.first();
    if (!channel) return interaction.update({ embeds: [errorEmbed('No channel selected.')], components: [backBtn('setup')], content: '' });
    let jobConfig = await CivilianJobConfig.findOne({ guildId });
    if (!jobConfig) jobConfig = new CivilianJobConfig({ guildId });
    jobConfig.channelId = channel.id;
    jobConfig.messageId = null;
    await jobConfig.save();
    if (jobConfig.jobs?.length) await postCivilianJobsPanel(interaction.guild, jobConfig);
    return interaction.update({ embeds: [successEmbed('Channel Set', `Civilian jobs channel set to ${channel}.${jobConfig.jobs?.length ? '\n\nPanel has been posted.' : '\n\nAdd jobs using "Add Job" and then post the panel.'}`)], components: [backBtn('setup')], content: '' });
  }

  if (interaction.customId === 'economy_civjobs_addjob_role_select') {
    const role = interaction.roles.first();
    if (!role) return interaction.update({ embeds: [errorEmbed('No role selected.')], components: [backBtn('setup')], content: '' });
    const modal = new ModalBuilder().setCustomId(`economysetup_civjobs_addjob_modal_${role.id}`).setTitle('Add Civilian Job');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Job Name').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('e.g. Taxi Driver')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Job Description (optional)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('e.g. Drive passengers around the city')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('duration').setLabel('Role Duration (hours)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('e.g. 24')),
    );
    return interaction.showModal(modal);
  }

  if (interaction.customId === 'economy_civjobs_removejob_select') {
    const jobId = interaction.values[0];
    let jobConfig = await CivilianJobConfig.findOne({ guildId });
    if (!jobConfig) return interaction.update({ embeds: [errorEmbed('No jobs config found.')], components: [backBtn('setup')], content: '' });
    const job = jobConfig.jobs.find(j => j.jobId === jobId);
    jobConfig.jobs = jobConfig.jobs.filter(j => j.jobId !== jobId);
    jobConfig.markModified('jobs');
    await jobConfig.save();
    if (jobConfig.channelId) await postCivilianJobsPanel(interaction.guild, jobConfig);
    return interaction.update({ embeds: [successEmbed('Job Removed', `**${job?.name || jobId}** has been removed from the civilian jobs panel.`)], components: [backBtn('setup')], content: '' });
  }

  // ── economysetup_store_rewardrole / reqrole ───────────────────────────────
  if (interaction.customId.startsWith('economysetup_store_rewardrole_')) {
    const itemId = interaction.customId.replace('economysetup_store_rewardrole_', '');
    const item = await EconomyStore.findOne({ _id: itemId, guildId });
    if (!item) return interaction.update({ embeds: [errorEmbed('Item not found.')], components: [], content: '' });
    const selectedRoleId = interaction.values[0] || null;
    item.roleId = selectedRoleId;
    await item.save();
    const roleText = selectedRoleId ? `**Reward Role** set to <@&${selectedRoleId}>` : '**Reward Role** cleared';
    return interaction.update({
      embeds: [new EmbedBuilder().setColor(0x2d2d2d)
        .setTitle('Item Updated')
        .setDescription(`**${item.name}** — ${roleText}.\n\nYou can set the required role below or click **Done**.`)
        .setFooter({ text: 'RPM' })],
      components: interaction.message.components,
    });
  }

  if (interaction.customId.startsWith('economysetup_store_reqrole_')) {
    const itemId = interaction.customId.replace('economysetup_store_reqrole_', '');
    const item = await EconomyStore.findOne({ _id: itemId, guildId });
    if (!item) return interaction.update({ embeds: [errorEmbed('Item not found.')], components: [], content: '' });
    const selectedRoleId = interaction.values[0] || null;
    item.requiredRoleId = selectedRoleId;
    await item.save();
    const roleText = selectedRoleId ? `**Required Role** set to <@&${selectedRoleId}>` : '**Required Role** cleared';
    return interaction.update({
      embeds: [new EmbedBuilder().setColor(0x2d2d2d)
        .setTitle('Item Updated')
        .setDescription(`**${item.name}** — ${roleText}.\n\nYou can set the reward role above or click **Done**.`)
        .setFooter({ text: 'RPM' })],
      components: interaction.message.components,
    });
  }

  // ── economysetup_storeremove_select ───────────────────────────────────────
  if (interaction.customId === 'economysetup_storeremove_select') {
    const itemId = interaction.values[0];
    const item = await EconomyStore.findOneAndDelete({ _id: itemId, guildId });
    if (!item) return interaction.update({ embeds: [errorEmbed('Item not found or already removed.')], components: [backBtn('setup')], content: '' });
    return interaction.update({ embeds: [successEmbed('Item Removed', `**${item.name}** has been removed from the store.`)], components: [backBtn('setup')], content: '' });
  }

  // ── economysetup_storeedit_select ─────────────────────────────────────────
  if (interaction.customId === 'economysetup_storeedit_select') {
    const itemId = interaction.values[0];
    const item = await EconomyStore.findOne({ _id: itemId, guildId });
    if (!item) return interaction.update({ embeds: [errorEmbed('Item not found.')], components: [backBtn('setup')], content: '' });
    const modal = new ModalBuilder().setCustomId(`economysetup_storeedit_modal_${item._id}`).setTitle(`Edit: ${item.name.slice(0, 40)}`);
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('price').setLabel('New Price (leave blank to keep current)').setStyle(TextInputStyle.Short)
          .setRequired(false).setValue(String(item.price)).setPlaceholder(String(item.price))
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('description').setLabel('New Description (leave blank to keep current)').setStyle(TextInputStyle.Paragraph)
          .setRequired(false).setValue(item.description || '').setPlaceholder(item.description || 'Enter a description...')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('roleid').setLabel('Reward Role Name (leave blank to keep)').setStyle(TextInputStyle.Short)
          .setRequired(false).setValue(item.roleId ? (interaction.guild.roles.cache.get(item.roleId)?.name || item.roleId) : '').setPlaceholder('Type a role name or leave blank')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('requiredroleid').setLabel('Required Role to Buy (leave blank to keep)').setStyle(TextInputStyle.Short)
          .setRequired(false).setValue(item.requiredRoleId ? (interaction.guild.roles.cache.get(item.requiredRoleId)?.name || item.requiredRoleId) : '').setPlaceholder('Type a role name or leave blank')
      ),
    );
    return interaction.showModal(modal);
  }
}

// ── Civilian Jobs Panel ───────────────────────────────────────────────────────
export async function postCivilianJobsPanel(guild, jobConfig) {
  if (!jobConfig?.channelId) return;
  const channel = guild.channels.cache.get(jobConfig.channelId);
  if (!channel) return;

  const jobs = jobConfig.jobs || [];
  const desc = jobs.length
    ? jobs.map(j => `**${j.name}**${j.description ? `\n-# ${j.description}` : ''}\n-# Role: <@&${j.roleId}> · Expires after ${j.durationHours}h`).join('\n\n')
    : 'No civilian jobs are available at this time.';

  const embed = new EmbedBuilder()
    .setColor(0x2d2d2d)
    .setTitle('Civilian Jobs')
    .setDescription(`Select a job from the menu below to apply. Your role will be assigned automatically and expire after the listed duration.\n\n${desc}`)
    .setFooter({ text: 'RPM' });

  const rows = [];
  if (jobs.length > 0) {
    const options = jobs.slice(0, 25).map(j => ({
      label: j.name.slice(0, 100),
      value: j.jobId,
      description: (j.description || `Role expires after ${j.durationHours}h`).slice(0, 100),
    }));
    rows.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('civjob_select')
        .setPlaceholder('Choose a job to apply for...')
        .addOptions(options)
    ));
  }

  try {
    if (jobConfig.messageId) {
      const existing = await channel.messages.fetch(jobConfig.messageId).catch(() => null);
      if (existing) {
        await existing.edit({ embeds: [embed], components: rows });
        return;
      }
    }
    const msg = await channel.send({ embeds: [embed], components: rows });
    jobConfig.messageId = msg.id;
    await jobConfig.save();
  } catch (err) {
    console.error('[CivilianJobs] Failed to post panel:', err.message);
  }
}

export async function handleCivilianJobApply(interaction) {
  const guildId = interaction.guildId;
  const userId  = interaction.user.id;
  const jobId   = interaction.values[0];

  const jobConfig = await CivilianJobConfig.findOne({ guildId });
  const job = jobConfig?.jobs?.find(j => j.jobId === jobId);
  if (!job) return interaction.reply({ embeds: [errorEmbed('This job no longer exists.')], flags: 64 });

  const existing = await JobAssignment.findOne({ guildId, userId, jobId, expiresAt: { $gt: new Date() } });
  if (existing) {
    const ts = Math.floor(existing.expiresAt.getTime() / 1000);
    return interaction.reply({ embeds: [errorEmbed(`You already hold this job. Your role expires <t:${ts}:R>.`)], flags: 64 });
  }

  try {
    await interaction.member.roles.add(job.roleId);
  } catch {
    return interaction.reply({ embeds: [errorEmbed('Could not assign your role. Make sure the bot has permission to manage roles and that its role is above the job role.')], flags: 64 });
  }

  const expiresAt = new Date(Date.now() + job.durationHours * 3600 * 1000);
  await JobAssignment.findOneAndDelete({ guildId, userId, jobId });
  await new JobAssignment({ guildId, userId, jobId, roleId: job.roleId, expiresAt }).save();

  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(0x43b581)
      .setTitle('Job Assigned')
      .setDescription(`You have been assigned the **${job.name}** job.\n**Role:** <@&${job.roleId}>\n**Expires:** <t:${Math.floor(expiresAt.getTime() / 1000)}:R>`)
      .setFooter({ text: 'RPM' })],
    flags: 64,
  });
}

export async function expireCivilianJobs(client) {
  try {
    const expired = await JobAssignment.find({ expiresAt: { $lte: new Date() } });
    for (const assignment of expired) {
      try {
        const guild = client.guilds.cache.get(assignment.guildId);
        if (guild) {
          const member = await guild.members.fetch(assignment.userId).catch(() => null);
          if (member) await member.roles.remove(assignment.roleId).catch(() => {});
        }
      } catch {}
      await assignment.deleteOne();
    }
  } catch (err) {
    console.error('[CivilianJobs] Expiry check error:', err.message);
  }
}

// ── Income Board ─────────────────────────────────────────────────────────────
export async function postIncomeBoard(guild, config) {
  if (!config.incomeChannelId) return;
  const channel = guild.channels.cache.get(config.incomeChannelId);
  if (!channel) return;

  let desc = 'Click the button below to collect all available income and apply any deductions to your balance.';
  desc += '\n\n-# Your payout is based on the roles assigned to you. Cooldowns apply per role.';

  const embed = new EmbedBuilder()
    .setColor(0x2d2d2d)
    .setTitle('Income Center')
    .setDescription(desc)
    .setFooter({ text: 'RPM' });

  const btn = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('collect_income').setLabel('Collect Income').setStyle(ButtonStyle.Success)
  );

  try {
    if (config.incomeMessageId) {
      const existing = await channel.messages.fetch(config.incomeMessageId).catch(() => null);
      if (existing) {
        await existing.edit({ embeds: [embed], components: [btn] });
        return;
      }
    }
    const msg = await channel.send({ embeds: [embed], components: [btn] });
    config.incomeMessageId = msg.id;
    await config.save();
  } catch (err) {
    console.error('[IncomeBoard] Failed to post panel:', err.message);
  }
}

// ── Button handler ────────────────────────────────────────────────────────────
export async function handleEconomyButton(interaction) {
  const guildId = interaction.guildId;
  const { customId } = interaction;

  if (customId === 'collect_income') {
    const { runIncome } = await import('./economyActions.js');
    return runIncome(interaction);
  }

  if (customId === 'economy_back_to_main') {
    return interaction.update(getEconomyMenu());
  }

  if (customId === 'economysetup_back_to_main') {
    return interaction.update(getEconomySetupMenu());
  }

  if (customId === 'economy_back_to_store') {
    const config = await getConfig(guildId);
    const sym = config?.currencySymbol || '$';
    const items = await EconomyStore.find({ guildId });
    if (!items.length) return interaction.update({ embeds: [errorEmbed('The store is empty.')], components: [backBtn()], content: '' });
    return interaction.update({
      embeds: [new EmbedBuilder().setColor(0x2d2d2d).setTitle('Server Store').setDescription(`**${items.length}** item${items.length !== 1 ? 's' : ''} available.\nSelect an item to view its details.`).setFooter({ text: 'RPM' })],
      components: [buildStoreMenu(items, sym, 'browse')],
      content: '',
    });
  }

  if (customId.startsWith('economysetup_store_togglesell_')) {
    const parts = customId.split('_');
    const currentState = parts[parts.length - 1];
    const itemId = parts.slice(0, -1).join('_').replace('economysetup_store_togglesell_', '');
    const newSellable = currentState === '1' ? false : true;
    await EconomyStore.findByIdAndUpdate(itemId, { sellable: newSellable }).catch(() => {});
    const newComponents = interaction.message.components.map(row => {
      const updated = row.components.map(c => {
        if (c.customId?.startsWith('economysetup_store_togglesell_')) {
          return new ButtonBuilder()
            .setCustomId(`economysetup_store_togglesell_${itemId}_${newSellable ? 1 : 0}`)
            .setLabel(newSellable ? 'Sellable: ON' : 'Sellable: OFF')
            .setStyle(newSellable ? ButtonStyle.Success : ButtonStyle.Danger);
        }
        return ButtonBuilder.from(c);
      });
      return new ActionRowBuilder().addComponents(updated);
    });
    return interaction.update({ components: newComponents });
  }

  if (customId.startsWith('economysetup_store_skiproles_')) {
    const itemId = customId.replace('economysetup_store_skiproles_', '');
    const item = await EconomyStore.findById(itemId).catch(() => null);
    const name = item?.name || 'Item';
    const roleNote = item?.roleId ? `\n**Reward Role:** <@&${item.roleId}>` : '';
    const reqNote  = item?.requiredRoleId ? `\n**Required to Buy:** <@&${item.requiredRoleId}>` : '';
    return interaction.update({
      embeds: [successEmbed('Done', `**${name}** is ready in the store.${roleNote}${reqNote}`)],
      components: [],
    });
  }

  if (customId.startsWith('economy_buy_now_')) {
    const itemId = customId.replace('economy_buy_now_', '');
    const config = await getConfig(guildId);
    const sym = config?.currencySymbol || '$';
    const item = await EconomyStore.findById(itemId).catch(() => null);
    if (!item) return interaction.update({ embeds: [errorEmbed('Item not found.')], components: [backBtn()], content: '' });
    const modal = new ModalBuilder().setCustomId(`economy_buy_qty_${item._id}_modal`).setTitle(`Buy ${item.name}`);
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('quantity').setLabel(`Quantity - ${sym}${fmt(item.price)} each`).setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('e.g. 1'))
    );
    return interaction.showModal(modal);
  }
}

// ── Modal handler ─────────────────────────────────────────────────────────────
export async function handleEconomyModal(interaction) {
  const guildId = interaction.guildId;
  const userId  = interaction.user.id;
  const { customId } = interaction;

  const config = await getConfig(guildId);
  const sym = config?.currencySymbol || '$';

  // ── Store search modals ─────────────────────────────────────────────────
  if (customId === 'economy_store_search_browse_modal' || customId === 'economy_store_search_buy_modal') {
    if (!config?.enabled) return interaction.reply({ embeds: [errorEmbed('Economy is not enabled.')], flags: 64 });
    const query = interaction.fields.getTextInputValue('query');
    const items = await EconomyStore.find({ guildId });
    const mode = customId === 'economy_store_search_buy_modal' ? 'buy' : 'browse';
    const filtered = items.filter(i => i.name.toLowerCase().includes(query.toLowerCase()));
    if (!filtered.length) return interaction.reply({ embeds: [errorEmbed(`No items matched **"${query}"**.`)], flags: 64 });
    const title = mode === 'buy' ? 'Buy Item' : 'Server Store';
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0x2d2d2d).setTitle(title).setDescription(`Showing **${filtered.length}** result${filtered.length !== 1 ? 's' : ''} for **"${query}"**.`).setFooter({ text: 'RPM' })],
      components: [buildStoreMenu(items, sym, mode, query)],
      flags: 64,
    });
  }

  // ── Buy quantity modal ──────────────────────────────────────────────────
  if (customId.startsWith('economy_buy_qty_') && customId.endsWith('_modal')) {
    if (!config?.enabled) return interaction.reply({ embeds: [errorEmbed('Economy is not enabled.')], flags: 64 });
    const itemId = customId.slice('economy_buy_qty_'.length, -'_modal'.length);
    const qty = parseInt(interaction.fields.getTextInputValue('quantity')) || 1;
    if (isNaN(qty) || qty < 1) return interaction.reply({ embeds: [errorEmbed('Invalid quantity.')], flags: 64 });
    const item = await EconomyStore.findById(itemId).catch(() => null);
    if (!item) return interaction.reply({ embeds: [errorEmbed('Item not found.')], flags: 64 });
    const total = item.price * qty;
    const bal = await getBalance(guildId, userId, config.startingBalance);
    if (bal.cash < total) return interaction.reply({ embeds: [errorEmbed(`You need ${sym}${fmt(total)} but only have ${sym}${fmt(bal.cash)}.`)], flags: 64 });
    bal.cash -= total; await bal.save();
    let inv = await EconomyInventory.findOne({ guildId, userId }) || new EconomyInventory({ guildId, userId, items: [] });
    const ex = inv.items.find(i => i.itemName === item.name);
    if (ex) ex.quantity += qty; else inv.items.push({ itemName: item.name, quantity: qty });
    inv.markModified('items'); await inv.save();
    return interaction.reply({ embeds: [successEmbed('Purchase Complete', `Bought **${item.name}** x${qty} for **${sym}${fmt(total)}**.\n**Remaining Cash:** ${sym}${fmt(bal.cash)}`)], flags: 64 });
  }

  // ── Member modals ───────────────────────────────────────────────────────
  if (customId === 'economy_deposit_modal') {
    if (!config?.enabled) return interaction.reply({ embeds: [errorEmbed('Economy is not enabled.')], flags: 64 });
    const raw = interaction.fields.getTextInputValue('amount');
    const bal = await getBalance(guildId, userId, config.startingBalance);
    const amount = raw.toLowerCase() === 'all' ? bal.cash : parseInt(raw);
    if (isNaN(amount) || amount < 1) return interaction.reply({ embeds: [errorEmbed('Enter a valid amount or "all".')], flags: 64 });
    if (amount > bal.cash) return interaction.reply({ embeds: [errorEmbed(`You only have ${sym}${fmt(bal.cash)} in cash.`)], flags: 64 });
    bal.cash -= amount; bal.bank = Math.min(bal.bank + amount, config.maxBalance);
    await bal.save();
    return interaction.reply({ embeds: [successEmbed('Deposited', `${sym}${fmt(amount)} moved to your bank.\n**Cash:** ${sym}${fmt(bal.cash)}  **Bank:** ${sym}${fmt(bal.bank)}`)], flags: 64 });
  }

  if (customId === 'economy_withdraw_modal') {
    if (!config?.enabled) return interaction.reply({ embeds: [errorEmbed('Economy is not enabled.')], flags: 64 });
    const raw = interaction.fields.getTextInputValue('amount');
    const bal = await getBalance(guildId, userId, config.startingBalance);
    const amount = raw.toLowerCase() === 'all' ? bal.bank : parseInt(raw);
    if (isNaN(amount) || amount < 1) return interaction.reply({ embeds: [errorEmbed('Enter a valid amount or "all".')], flags: 64 });
    if (amount > bal.bank) return interaction.reply({ embeds: [errorEmbed(`You only have ${sym}${fmt(bal.bank)} in your bank.`)], flags: 64 });
    bal.bank -= amount; bal.cash = Math.min(bal.cash + amount, config.maxBalance);
    await bal.save();
    return interaction.reply({ embeds: [successEmbed('Withdrawn', `${sym}${fmt(amount)} moved to your cash.\n**Cash:** ${sym}${fmt(bal.cash)}  **Bank:** ${sym}${fmt(bal.bank)}`)], flags: 64 });
  }

  if (customId === 'economy_give_modal') {
    if (!config?.enabled) return interaction.reply({ embeds: [errorEmbed('Economy is not enabled.')], flags: 64 });
    const targetId = parseUserId(interaction.fields.getTextInputValue('user_id'));
    const amount   = parseInt(interaction.fields.getTextInputValue('amount'));
    if (!targetId) return interaction.reply({ embeds: [errorEmbed('Invalid user ID or mention.')], flags: 64 });
    if (targetId === userId) return interaction.reply({ embeds: [errorEmbed('You cannot give money to yourself.')], flags: 64 });
    if (isNaN(amount) || amount < 1) return interaction.reply({ embeds: [errorEmbed('Enter a valid amount.')], flags: 64 });
    const bal = await getBalance(guildId, userId, config.startingBalance);
    if (bal.cash < amount) return interaction.reply({ embeds: [errorEmbed(`You only have ${sym}${fmt(bal.cash)} in cash.`)], flags: 64 });
    const targetBal = await getBalance(guildId, targetId, config.startingBalance);
    bal.cash -= amount; targetBal.cash = Math.min(targetBal.cash + amount, config.maxBalance);
    await Promise.all([bal.save(), targetBal.save()]);
    return interaction.reply({ embeds: [successEmbed('Money Given', `You gave ${sym}${fmt(amount)} to <@${targetId}>.\n**Your Cash:** ${sym}${fmt(bal.cash)}`)], flags: 64 });
  }

  if (customId === 'economy_rob_modal') {
    if (!config?.enabled) return interaction.reply({ embeds: [errorEmbed('Economy is not enabled.')], flags: 64 });
    if (!config.rob.enabled) return interaction.reply({ embeds: [errorEmbed('Robbing is disabled.')], flags: 64 });
    const targetId = parseUserId(interaction.fields.getTextInputValue('user_id'));
    if (!targetId || targetId === userId) return interaction.reply({ embeds: [errorEmbed('Invalid target.')], flags: 64 });
    const bal = await getBalance(guildId, userId, config.startingBalance);
    const rem = cooldownRemaining(bal.robCooldown, config.rob.cooldown);
    if (rem > 0) return interaction.reply({ embeds: [errorEmbed(`You can rob again in **${formatMs(rem)}**.`)], flags: 64 });
    const targetBal = await getBalance(guildId, targetId, config.startingBalance);
    if (targetBal.cash < 10) return interaction.reply({ embeds: [errorEmbed('That user doesn\'t have enough cash to rob.')], flags: 64 });
    bal.robCooldown = new Date();
    if (Math.random() * 100 < config.rob.successRate) {
      const stolen = Math.max(1, Math.floor(targetBal.cash * (config.rob.maxStealPercent / 100) * Math.random()));
      targetBal.cash = Math.max(0, targetBal.cash - stolen);
      bal.cash = Math.min(bal.cash + stolen, config.maxBalance);
      await Promise.all([bal.save(), targetBal.save()]);
      return interaction.reply({ embeds: [successEmbed('Rob Successful', `You robbed <@${targetId}> for **${sym}${fmt(stolen)}**!\n**Your Cash:** ${sym}${fmt(bal.cash)}`)], flags: 64 });
    } else {
      const fine = Math.floor(targetBal.cash * 0.1);
      bal.cash = Math.max(0, bal.cash - fine);
      await bal.save();
      return interaction.reply({ embeds: [{ color: 0xf04747, title: 'Rob Failed', description: `You got caught and paid **${sym}${fmt(fine)}**.\n-# Next rob: ${formatMs(config.rob.cooldown * 60 * 1000)}`, footer: { text: 'RPM' } }], flags: 64 });
    }
  }

  if (customId === 'economy_buy_modal') {
    if (!config?.enabled) return interaction.reply({ embeds: [errorEmbed('Economy is not enabled.')], flags: 64 });
    const itemName = interaction.fields.getTextInputValue('item');
    const qty = parseInt(interaction.fields.getTextInputValue('quantity') || '1') || 1;
    const item = await EconomyStore.findOne({ guildId, name: { $regex: new RegExp(`^${itemName}$`, 'i') } });
    if (!item) return interaction.reply({ embeds: [errorEmbed(`No item named **${itemName}** found.`)], flags: 64 });
    const total = item.price * qty;
    const bal = await getBalance(guildId, userId, config.startingBalance);
    if (bal.cash < total) return interaction.reply({ embeds: [errorEmbed(`You need ${sym}${fmt(total)} but only have ${sym}${fmt(bal.cash)}.`)], flags: 64 });
    bal.cash -= total; await bal.save();
    let inv = await EconomyInventory.findOne({ guildId, userId }) || new EconomyInventory({ guildId, userId, items: [] });
    const ex = inv.items.find(i => i.itemName === item.name);
    if (ex) ex.quantity += qty; else inv.items.push({ itemName: item.name, quantity: qty });
    inv.markModified('items'); await inv.save();
    return interaction.reply({ embeds: [successEmbed('Purchase Complete', `Bought **${item.name}** x${qty} for **${sym}${fmt(total)}**.\n**Remaining Cash:** ${sym}${fmt(bal.cash)}`)], flags: 64 });
  }

  if (customId === 'economy_sell_modal') {
    if (!config?.enabled) return interaction.reply({ embeds: [errorEmbed('Economy is not enabled.')], flags: 64 });
    const itemName = interaction.fields.getTextInputValue('item');
    const qty = parseInt(interaction.fields.getTextInputValue('quantity') || '1') || 1;
    const bal = await getBalance(guildId, userId, config.startingBalance);
    const inv = await EconomyInventory.findOne({ guildId, userId });
    const owned = inv?.items.find(i => i.itemName.toLowerCase() === itemName.toLowerCase());
    if (!owned || owned.quantity < qty) return interaction.reply({ embeds: [errorEmbed(`You don't have ${qty}x **${itemName}**.`)], flags: 64 });
    const storeItem = await EconomyStore.findOne({ guildId, name: { $regex: new RegExp(`^${itemName}$`, 'i') } });
    const refund = storeItem ? Math.floor(storeItem.price * qty * 0.5) : 0;
    owned.quantity -= qty;
    if (owned.quantity <= 0) inv.items = inv.items.filter(i => i.itemName.toLowerCase() !== itemName.toLowerCase());
    inv.markModified('items'); await inv.save();
    if (refund > 0) { bal.cash = Math.min(bal.cash + refund, config.maxBalance); await bal.save(); }
    return interaction.reply({ embeds: [successEmbed('Items Sold', `Sold **${itemName}** x${qty} for **${sym}${fmt(refund)}**.\n**Cash:** ${sym}${fmt(bal.cash)}`)], flags: 64 });
  }

  if (customId === 'economy_use_modal') {
    if (!config?.enabled) return interaction.reply({ embeds: [errorEmbed('Economy is not enabled.')], flags: 64 });
    const itemName = interaction.fields.getTextInputValue('item');
    const inv = await EconomyInventory.findOne({ guildId, userId });
    const owned = inv?.items.find(i => i.itemName.toLowerCase() === itemName.toLowerCase());
    if (!owned || owned.quantity < 1) return interaction.reply({ embeds: [errorEmbed(`You don't have **${itemName}**.`)], flags: 64 });
    const storeItem = await EconomyStore.findOne({ guildId, name: { $regex: new RegExp(`^${itemName}$`, 'i') } });
    if (!storeItem?.usable) return interaction.reply({ embeds: [errorEmbed(`**${itemName}** cannot be used.`)], flags: 64 });
    owned.quantity -= 1;
    if (owned.quantity <= 0) inv.items = inv.items.filter(i => i.itemName.toLowerCase() !== itemName.toLowerCase());
    inv.markModified('items'); await inv.save();
    return interaction.reply({ embeds: [successEmbed(`Used: ${storeItem.name}`, storeItem.useEffect || 'You used the item.')], flags: 64 });
  }

  if (customId === 'economy_giveitems_modal') {
    if (!config?.enabled) return interaction.reply({ embeds: [errorEmbed('Economy is not enabled.')], flags: 64 });
    const targetId = parseUserId(interaction.fields.getTextInputValue('user_id'));
    const itemName = interaction.fields.getTextInputValue('item');
    const qty = parseInt(interaction.fields.getTextInputValue('quantity') || '1') || 1;
    if (!targetId || targetId === userId) return interaction.reply({ embeds: [errorEmbed('Invalid target.')], flags: 64 });
    const inv = await EconomyInventory.findOne({ guildId, userId });
    const owned = inv?.items.find(i => i.itemName.toLowerCase() === itemName.toLowerCase());
    if (!owned || owned.quantity < qty) return interaction.reply({ embeds: [errorEmbed(`You don't have ${qty}x **${itemName}**.`)], flags: 64 });
    owned.quantity -= qty;
    if (owned.quantity <= 0) inv.items = inv.items.filter(i => i.itemName.toLowerCase() !== itemName.toLowerCase());
    inv.markModified('items'); await inv.save();
    let tInv = await EconomyInventory.findOne({ guildId, userId: targetId }) || new EconomyInventory({ guildId, userId: targetId, items: [] });
    const tOwned = tInv.items.find(i => i.itemName.toLowerCase() === itemName.toLowerCase());
    if (tOwned) tOwned.quantity += qty; else tInv.items.push({ itemName, quantity: qty });
    tInv.markModified('items'); await tInv.save();
    return interaction.reply({ embeds: [successEmbed('Items Given', `You gave **${itemName}** x${qty} to <@${targetId}>.`)], flags: 64 });
  }

  // ── Gambling modals ─────────────────────────────────────────────────────
  if (customId === 'economy_roulette_modal') {
    if (!config?.enabled || !config.gambling.enabled) return interaction.reply({ embeds: [errorEmbed('Gambling is not available.')], flags: 64 });
    const bet = parseInt(interaction.fields.getTextInputValue('bet'));
    const choice = interaction.fields.getTextInputValue('choice').toLowerCase().trim();
    if (!['red','black','green'].includes(choice)) return interaction.reply({ embeds: [errorEmbed('Choice must be: red, black, or green.')], flags: 64 });
    if (isNaN(bet) || bet < config.gambling.minBet) return interaction.reply({ embeds: [errorEmbed(`Minimum bet is ${sym}${fmt(config.gambling.minBet)}.`)], flags: 64 });
    if (bet > config.gambling.maxBet) return interaction.reply({ embeds: [errorEmbed(`Maximum bet is ${sym}${fmt(config.gambling.maxBet)}.`)], flags: 64 });
    const bal = await getBalance(guildId, userId, config.startingBalance);
    if (bet > bal.cash) return interaction.reply({ embeds: [errorEmbed(`You only have ${sym}${fmt(bal.cash)} in cash.`)], flags: 64 });
    const cdRem = cooldownRemaining(bal.gamblingCooldown, config.gambling.cooldown);
    if (cdRem > 0) return interaction.reply({ embeds: [errorEmbed(`You can gamble again in **${formatMs(cdRem)}**.`)], flags: 64 });
    const roll = Math.floor(Math.random() * 38);
    const landed = roll === 0 ? 'green' : roll <= 18 ? 'red' : 'black';
    const mults = { red: 2, black: 2, green: 14 };
    const won = landed === choice;
    const change = won ? bet * (mults[choice] - 1) : -bet;
    if (won) bal.cash = Math.min(bal.cash + change, config.maxBalance); else bal.cash = Math.max(0, bal.cash - bet);
    bal.gamblingCooldown = new Date(); await bal.save();
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(won ? 0x43b581 : 0xf04747).setTitle('Roulette').setDescription(`The wheel landed on **${landed.charAt(0).toUpperCase() + landed.slice(1)}**.\n\n${won ? `You win **${sym}${fmt(change)}**!` : `You lose **${sym}${fmt(bet)}**.`}\n**Cash:** ${sym}${fmt(bal.cash)}`).setFooter({ text: 'RPM' })], flags: 64 });
  }

  if (customId.startsWith('economy_gamble_') && customId.endsWith('_modal')) {
    const game = customId.slice('economy_gamble_'.length, -'_modal'.length);
    if (!config?.enabled || !config.gambling.enabled) return interaction.reply({ embeds: [errorEmbed('Gambling is not available.')], flags: 64 });
    if (!hasPermission(interaction.member, config.permissions?.gamblingRoles)) return interaction.reply({ embeds: [errorEmbed('You do not have the required role to gamble.')], flags: 64 });
    const bet = parseInt(interaction.fields.getTextInputValue('bet'));
    if (isNaN(bet) || bet < config.gambling.minBet) return interaction.reply({ embeds: [errorEmbed(`Minimum bet is ${sym}${fmt(config.gambling.minBet)}.`)], flags: 64 });
    if (bet > config.gambling.maxBet) return interaction.reply({ embeds: [errorEmbed(`Maximum bet is ${sym}${fmt(config.gambling.maxBet)}.`)], flags: 64 });
    const bal = await getBalance(guildId, userId, config.startingBalance);
    if (bet > bal.cash) return interaction.reply({ embeds: [errorEmbed(`You only have ${sym}${fmt(bal.cash)} in cash.`)], flags: 64 });
    const cdRem = cooldownRemaining(bal.gamblingCooldown, config.gambling.cooldown);
    if (cdRem > 0) return interaction.reply({ embeds: [errorEmbed(`You can gamble again in **${formatMs(cdRem)}**.`)], flags: 64 });

    if (game === 'blackjack') {
      const deck = newDeck(), player = [deck.pop(), deck.pop()], dealer = [deck.pop(), deck.pop()];
      let pt = handTotal(player), dt = handTotal(dealer);
      while (dt < 17) { dealer.push(deck.pop()); dt = handTotal(dealer); }
      let result = 'lose';
      if (pt > 21) result = 'lose';
      else if (dt > 21 || pt > dt) result = (pt === 21 && player.length === 2) ? 'blackjack' : 'win';
      else if (pt === dt) result = 'push';
      let winAmt = 0;
      if (result === 'blackjack') { winAmt = Math.floor(bet * 1.5); bal.cash = Math.min(bal.cash + winAmt, config.maxBalance); }
      else if (result === 'win')  { winAmt = bet; bal.cash = Math.min(bal.cash + bet, config.maxBalance); }
      else if (result === 'lose') { bal.cash = Math.max(0, bal.cash - bet); }
      bal.gamblingCooldown = new Date(); await bal.save();
      const txt = { blackjack: `Blackjack! +**${sym}${fmt(winAmt)}**`, win: `You win **${sym}${fmt(winAmt)}**!`, lose: `You lose **${sym}${fmt(bet)}**.`, push: 'Push - bet returned.' }[result];
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(result === 'lose' ? 0xf04747 : result === 'push' ? 0xfaa61a : 0x43b581).setTitle('Blackjack').setDescription(`**Your hand:** ${handStr(player)} (${pt})\n**Dealer:** ${handStr(dealer)} (${dt})\n\n${txt}\n**Cash:** ${sym}${fmt(bal.cash)}`).setFooter({ text: 'RPM' })], flags: 64 });
    }

    if (game === 'slots') {
      const reels = [spinSlot(), spinSlot(), spinSlot()], mult = slotMult(reels);
      if (mult > 0) bal.cash = Math.min(bal.cash + Math.floor(bet * mult), config.maxBalance); else bal.cash = Math.max(0, bal.cash - bet);
      bal.gamblingCooldown = new Date(); await bal.save();
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(mult > 0 ? 0x43b581 : 0xf04747).setTitle('Slot Machine').setDescription(`[ ${reels.join(' | ')} ]\n\n${mult > 0 ? `**${mult}x** - You win **${sym}${fmt(Math.floor(bet * mult))}**!` : `No match - you lose **${sym}${fmt(bet)}**.`}\n**Cash:** ${sym}${fmt(bal.cash)}`).setFooter({ text: 'RPM' })], flags: 64 });
    }

    if (game === 'roll') {
      const pr = Math.floor(Math.random() * 6) + 1, br = Math.floor(Math.random() * 6) + 1;
      let result = 'tie';
      if (pr > br) { result = 'win'; bal.cash = Math.min(bal.cash + bet, config.maxBalance); }
      else if (pr < br) { result = 'lose'; bal.cash = Math.max(0, bal.cash - bet); }
      bal.gamblingCooldown = new Date(); await bal.save();
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(result === 'win' ? 0x43b581 : result === 'lose' ? 0xf04747 : 0xfaa61a).setTitle('Dice Roll').setDescription(`**You:** ${pr}  **Bot:** ${br}\n\n${result === 'win' ? `You win **${sym}${fmt(bet)}**!` : result === 'lose' ? `You lose **${sym}${fmt(bet)}**.` : 'Tie - bet returned.'}\n**Cash:** ${sym}${fmt(bal.cash)}`).setFooter({ text: 'RPM' })], flags: 64 });
    }

    if (game === 'russianroulette') {
      if (Math.floor(Math.random() * 6) === 0) {
        const lost = bal.cash; bal.cash = 0; bal.gamblingCooldown = new Date(); await bal.save();
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xf04747).setTitle('Russian Roulette').setDescription(`*click* **BANG** - You lost everything (**${sym}${fmt(lost)}**).\n**Cash:** ${sym}0`).setFooter({ text: 'RPM' })], flags: 64 });
      } else {
        const win = Math.floor(bet * 0.5); bal.cash = Math.min(bal.cash + win, config.maxBalance); bal.gamblingCooldown = new Date(); await bal.save();
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x43b581).setTitle('Russian Roulette').setDescription(`*click* You survived! Won **${sym}${fmt(win)}**.\n**Cash:** ${sym}${fmt(bal.cash)}`).setFooter({ text: 'RPM' })], flags: 64 });
      }
    }

    if (game === 'cockfight') {
      if (Math.random() < 0.5) {
        const win = Math.floor(bet * 0.8); bal.cash = Math.min(bal.cash + win, config.maxBalance); bal.gamblingCooldown = new Date(); await bal.save();
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x43b581).setTitle('Cock Fight').setDescription(`Your rooster won! +**${sym}${fmt(win)}**.\n**Cash:** ${sym}${fmt(bal.cash)}`).setFooter({ text: 'RPM' })], flags: 64 });
      } else {
        bal.cash = Math.max(0, bal.cash - bet); bal.gamblingCooldown = new Date(); await bal.save();
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xf04747).setTitle('Cock Fight').setDescription(`Your rooster lost. −**${sym}${fmt(bet)}**.\n**Cash:** ${sym}${fmt(bal.cash)}`).setFooter({ text: 'RPM' })], flags: 64 });
      }
    }
  }

  // ── Admin/setup modals ──────────────────────────────────────────────────
  if (!customId.startsWith('economysetup_')) return;
  if (!await checkStaffPermission(interaction)) return interaction.reply({ embeds: [errorEmbed('You do not have permission.')], flags: 64 });

  let config2 = await getConfig(guildId) || new EconomyConfig({ guildId });

  if (customId === 'economysetup_currency_modal') {
    const symbol   = interaction.fields.getTextInputValue('symbol');
    const starting = parseInt(interaction.fields.getTextInputValue('starting'));
    const max      = parseInt(interaction.fields.getTextInputValue('max'));
    config2.currencySymbol = symbol;
    if (!isNaN(starting)) config2.startingBalance = starting;
    if (!isNaN(max)) config2.maxBalance = max;
    await config2.save();
    return interaction.reply({ embeds: [successEmbed('Currency Updated', `**Symbol:** ${symbol}\n**Starting:** ${config2.startingBalance}\n**Max:** ${config2.maxBalance}`)], flags: 64 });
  }

  if (customId === 'economysetup_work_modal') {
    const en  = interaction.fields.getTextInputValue('enabled').toLowerCase();
    const cd  = parseInt(interaction.fields.getTextInputValue('cooldown'));
    const min = parseInt(interaction.fields.getTextInputValue('minpay'));
    const max = parseInt(interaction.fields.getTextInputValue('maxpay'));
    if (['yes','no'].includes(en)) config2.work.enabled = en === 'yes';
    if (!isNaN(cd)) config2.work.cooldown = cd;
    if (!isNaN(min)) config2.work.minPayout = min;
    if (!isNaN(max)) config2.work.maxPayout = max;
    config2.markModified('work'); await config2.save();
    return interaction.reply({ embeds: [successEmbed('Work Updated', `**Enabled:** ${config2.work.enabled}\n**Cooldown:** ${config2.work.cooldown}m\n**Pay:** ${sym}${config2.work.minPayout}–${sym}${config2.work.maxPayout}`)], flags: 64 });
  }

  if (customId === 'economysetup_crime_modal') {
    const en   = interaction.fields.getTextInputValue('enabled').toLowerCase();
    const cd   = parseInt(interaction.fields.getTextInputValue('cooldown'));
    const sr   = parseInt(interaction.fields.getTextInputValue('successrate'));
    const min  = parseInt(interaction.fields.getTextInputValue('minpay'));
    const max  = parseInt(interaction.fields.getTextInputValue('maxpay'));
    if (['yes','no'].includes(en)) config2.crime.enabled = en === 'yes';
    if (!isNaN(cd))  config2.crime.cooldown    = cd;
    if (!isNaN(sr))  config2.crime.successRate = Math.min(100, Math.max(1, sr));
    if (!isNaN(min)) config2.crime.minPayout   = min;
    if (!isNaN(max)) config2.crime.maxPayout   = max;
    config2.markModified('crime'); await config2.save();
    return interaction.reply({ embeds: [successEmbed('Crime Updated', `**Enabled:** ${config2.crime.enabled}\n**Cooldown:** ${config2.crime.cooldown}m\n**Success:** ${config2.crime.successRate}%`)], flags: 64 });
  }

  if (customId === 'economysetup_rob_modal') {
    const en  = interaction.fields.getTextInputValue('enabled').toLowerCase();
    const cd  = parseInt(interaction.fields.getTextInputValue('cooldown'));
    const sr  = parseInt(interaction.fields.getTextInputValue('successrate'));
    const ms  = parseInt(interaction.fields.getTextInputValue('maxsteal'));
    if (['yes','no'].includes(en)) config2.rob.enabled = en === 'yes';
    if (!isNaN(cd)) config2.rob.cooldown       = cd;
    if (!isNaN(sr)) config2.rob.successRate    = Math.min(100, Math.max(1, sr));
    if (!isNaN(ms)) config2.rob.maxStealPercent = Math.min(100, Math.max(1, ms));
    config2.markModified('rob'); await config2.save();
    return interaction.reply({ embeds: [successEmbed('Rob Updated', `**Enabled:** ${config2.rob.enabled}\n**Cooldown:** ${config2.rob.cooldown}m\n**Success:** ${config2.rob.successRate}%`)], flags: 64 });
  }

  if (customId === 'economysetup_gambling_modal') {
    const en  = interaction.fields.getTextInputValue('enabled').toLowerCase();
    const min = parseInt(interaction.fields.getTextInputValue('minbet'));
    const max = parseInt(interaction.fields.getTextInputValue('maxbet'));
    const cd  = parseInt(interaction.fields.getTextInputValue('cooldown'));
    if (['yes','no'].includes(en)) config2.gambling.enabled = en === 'yes';
    if (!isNaN(min)) config2.gambling.minBet   = min;
    if (!isNaN(max)) config2.gambling.maxBet   = max;
    if (!isNaN(cd))  config2.gambling.cooldown = cd;
    config2.markModified('gambling'); await config2.save();
    return interaction.reply({ embeds: [successEmbed('Gambling Updated', `**Enabled:** ${config2.gambling.enabled}\n**Bet:** ${sym}${config2.gambling.minBet}–${sym}${config2.gambling.maxBet}`)], flags: 64 });
  }

  if (customId === 'economysetup_chatmoney_modal') {
    const en  = interaction.fields.getTextInputValue('enabled').toLowerCase();
    const min = parseInt(interaction.fields.getTextInputValue('min'));
    const max = parseInt(interaction.fields.getTextInputValue('max'));
    const cd  = parseInt(interaction.fields.getTextInputValue('cooldown'));
    if (['yes','no'].includes(en)) config2.chatMoney.enabled = en === 'yes';
    if (!isNaN(min)) config2.chatMoney.minAmount = min;
    if (!isNaN(max)) config2.chatMoney.maxAmount = max;
    if (!isNaN(cd))  config2.chatMoney.cooldown  = cd;
    config2.markModified('chatMoney'); await config2.save();
    return interaction.reply({ embeds: [successEmbed('Chat Money Updated', `**Enabled:** ${config2.chatMoney.enabled}\n**Amount:** ${sym}${config2.chatMoney.minAmount}–${sym}${config2.chatMoney.maxAmount}\n**Cooldown:** ${config2.chatMoney.cooldown}s`)], flags: 64 });
  }

  if (customId === 'economysetup_incometax_modal') {
    const rate = parseFloat(interaction.fields.getTextInputValue('rate'));
    if (isNaN(rate) || rate < 0 || rate > 100) return interaction.reply({ embeds: [errorEmbed('Enter a valid tax rate between 0 and 100.')], flags: 64 });
    config2.incomeTax = rate;
    await config2.save();
    return interaction.reply({ embeds: [successEmbed('Income Tax Updated', `Tax rate set to **${rate}%**.\n-# ${rate === 0 ? 'Income tax is now disabled.' : `${rate}% will be deducted from all income collected.`}`)], flags: 64 });
  }

  if (customId === 'economysetup_sellsettings_modal') {
    const pct = parseFloat(interaction.fields.getTextInputValue('percent'));
    if (isNaN(pct) || pct < 0 || pct > 100) return interaction.reply({ embeds: [errorEmbed('Enter a valid percentage between 0 and 100.')], flags: 64 });
    config2.sellPercent = pct;
    await config2.save();
    return interaction.reply({ embeds: [successEmbed('Sell Settings Updated', `Members will receive **${pct}%** of an item's price when selling it back.`)], flags: 64 });
  }

  if (customId.startsWith('economysetup_roleincome_modal_')) {
    const roleId    = customId.replace('economysetup_roleincome_modal_', '');
    const amount    = parseInt(interaction.fields.getTextInputValue('amount'));
    const cooldownH = parseInt(interaction.fields.getTextInputValue('cooldown'));
    if (isNaN(amount) || amount < 1) return interaction.reply({ embeds: [errorEmbed('Invalid amount.')], flags: 64 });
    if (isNaN(cooldownH) || cooldownH < 1) return interaction.reply({ embeds: [errorEmbed('Invalid cooldown.')], flags: 64 });
    const ex = config2.roleIncome.find(r => r.roleId === roleId);
    if (!ex) {
      const { getGuildLimits } = await import('../utils/premiumCheck.js');
      const limits = await getGuildLimits(interaction.guildId);
      if (config2.roleIncome.length >= limits.roleIncomeRoles) {
        return interaction.reply({
          embeds: [errorEmbed(
            'Role Income Limit Reached',
            `This server can have up to **${limits.roleIncomeRoles} role income** entries on the free plan.\n` +
            `[Get Premium →](https://roleplaymanager.xyz/pricing) for unlimited role income entries.`
          )],
          flags: 64,
        });
      }
    }
    if (ex) { ex.amount = amount; ex.cooldown = cooldownH; } else config2.roleIncome.push({ roleId, amount, cooldown: cooldownH });
    config2.markModified('roleIncome'); await config2.save();
    return interaction.reply({ embeds: [successEmbed('Role Income Set', `<@&${roleId}>: ${sym}${fmt(amount)} every ${cooldownH}h`)], flags: 64 });
  }

  if (customId.startsWith('economysetup_rolededuction_modal_')) {
    const roleId    = customId.replace('economysetup_rolededuction_modal_', '');
    const label     = interaction.fields.getTextInputValue('label').trim() || 'Deduction';
    const amount    = parseInt(interaction.fields.getTextInputValue('amount'));
    const cooldownH = parseInt(interaction.fields.getTextInputValue('cooldown'));
    if (isNaN(amount) || amount < 1) return interaction.reply({ embeds: [errorEmbed('Invalid amount.')], flags: 64 });
    if (isNaN(cooldownH) || cooldownH < 1) return interaction.reply({ embeds: [errorEmbed('Invalid cooldown.')], flags: 64 });
    if (!config2.roleDeductions) config2.roleDeductions = [];
    const ex = config2.roleDeductions.find(r => r.roleId === roleId);
    if (ex) { ex.amount = amount; ex.cooldown = cooldownH; ex.label = label; } else config2.roleDeductions.push({ roleId, amount, cooldown: cooldownH, label });
    config2.markModified('roleDeductions'); await config2.save();
    return interaction.reply({ embeds: [successEmbed('Role Deduction Set', `<@&${roleId}>: **-${sym}${fmt(amount)}** every ${cooldownH}h\n-# Label: ${label}`)], flags: 64 });
  }

  if (customId === 'economysetup_storeadd_modal') {
    const name  = interaction.fields.getTextInputValue('name');
    const price = parseInt(interaction.fields.getTextInputValue('price'));
    const desc  = interaction.fields.getTextInputValue('description');
    if (isNaN(price) || price < 1) return interaction.reply({ embeds: [errorEmbed('Invalid price.')], flags: 64 });
    if (await EconomyStore.findOne({ guildId, name: { $regex: new RegExp(`^${name}$`, 'i') } })) return interaction.reply({ embeds: [errorEmbed(`**${name}** already exists.`)], flags: 64 });
    const item = await EconomyStore.create({ guildId, name, price, description: desc, usable: false, sellable: true });
    const itemId = item._id.toString();
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0x2d2d2d)
        .setTitle('Item Added')
        .setDescription(`**${name}** added for ${sym}${fmt(price)}.\n-# ${desc}\n\nOptionally assign roles and toggle sellable below, then click **Done**.`)
        .setFooter({ text: 'RPM' })],
      components: [
        new ActionRowBuilder().addComponents(
          new RoleSelectMenuBuilder()
            .setCustomId(`economysetup_store_rewardrole_${itemId}`)
            .setPlaceholder('Reward Role — granted on purchase (optional)')
            .setMinValues(0).setMaxValues(1)
        ),
        new ActionRowBuilder().addComponents(
          new RoleSelectMenuBuilder()
            .setCustomId(`economysetup_store_reqrole_${itemId}`)
            .setPlaceholder('Required Role — must have to buy (optional)')
            .setMinValues(0).setMaxValues(1)
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`economysetup_store_togglesell_${itemId}_1`)
            .setLabel('Sellable: ON')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`economysetup_store_skiproles_${itemId}`)
            .setLabel('Done')
            .setStyle(ButtonStyle.Secondary)
        ),
      ],
      flags: 64,
    });
  }

  if (customId.startsWith('economysetup_civjobs_addjob_modal_')) {
    const roleId = customId.replace('economysetup_civjobs_addjob_modal_', '');
    const name = interaction.fields.getTextInputValue('name')?.trim();
    const description = interaction.fields.getTextInputValue('description')?.trim() || '';
    const durationHours = parseFloat(interaction.fields.getTextInputValue('duration'));
    if (!name) return interaction.reply({ embeds: [errorEmbed('Job name is required.')], flags: 64 });
    if (isNaN(durationHours) || durationHours <= 0) return interaction.reply({ embeds: [errorEmbed('Duration must be a positive number (e.g. 24).')], flags: 64 });
    let jobConfig = await CivilianJobConfig.findOne({ guildId });
    if (!jobConfig) jobConfig = new CivilianJobConfig({ guildId });
    if ((jobConfig.jobs?.length || 0) >= 25) return interaction.reply({ embeds: [errorEmbed('Maximum of 25 jobs per server.')], flags: 64 });
    const jobId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    jobConfig.jobs.push({ jobId, name, description, roleId, durationHours });
    jobConfig.markModified('jobs');
    await jobConfig.save();
    if (jobConfig.channelId) await postCivilianJobsPanel(interaction.guild, jobConfig);
    return interaction.reply({ embeds: [successEmbed('Job Added', `**${name}** added to the civilian jobs panel.\n**Role:** <@&${roleId}> · **Expires:** ${durationHours}h${jobConfig.channelId ? '\n\nPanel has been updated.' : '\n\nSet a jobs channel and post the panel to make this visible to members.'}`)], flags: 64 });
  }

  if (customId.startsWith('economysetup_storeedit_modal_')) {
    const itemId = customId.replace('economysetup_storeedit_modal_', '');
    const item = await EconomyStore.findOne({ _id: itemId, guildId });
    if (!item) return interaction.reply({ embeds: [errorEmbed('Item not found.')], flags: 64 });
    const pr = parseInt(interaction.fields.getTextInputValue('price'));
    const ds = interaction.fields.getTextInputValue('description');
    const ri = interaction.fields.getTextInputValue('roleid')?.trim();
    const rri = interaction.fields.getTextInputValue('requiredroleid')?.trim();
    const resolveRole = (input) => {
      if (!input) return null;
      if (/^\d+$/.test(input)) return input;
      const found = interaction.guild.roles.cache.find(r => r.name.toLowerCase() === input.toLowerCase());
      return found?.id || null;
    };
    if (!isNaN(pr) && pr > 0) item.price = pr;
    if (ds?.trim()) item.description = ds.trim();
    if (ri !== undefined) item.roleId = resolveRole(ri);
    if (rri !== undefined) item.requiredRoleId = resolveRole(rri);
    await item.save();
    const roleNote = item.roleId ? `\n**Reward Role:** <@&${item.roleId}>` : '';
    const reqNote  = item.requiredRoleId ? `\n**Required to Buy:** <@&${item.requiredRoleId}>` : '';
    return interaction.reply({ embeds: [successEmbed('Item Updated', `**${item.name}** updated.\n**Price:** ${config2?.currencySymbol || '$'}${fmt(item.price)}\n**Description:** ${item.description || 'None'}${roleNote}${reqNote}`)], flags: 64 });
  }

  if (customId === 'economysetup_addmoney_modal') {
    const targetId = parseUserId(interaction.fields.getTextInputValue('user_id'));
    const amount   = parseInt(interaction.fields.getTextInputValue('amount'));
    if (!targetId) return interaction.reply({ embeds: [errorEmbed('Invalid user ID.')], flags: 64 });
    if (isNaN(amount) || amount < 1) return interaction.reply({ embeds: [errorEmbed('Invalid amount.')], flags: 64 });
    const bal = await getBalance(guildId, targetId, config2.startingBalance);
    bal.cash = Math.min(bal.cash + amount, config2.maxBalance); await bal.save();
    await logTx(interaction, config2, `Added **${sym}${fmt(amount)}** to <@${targetId}>'s cash.`);
    return interaction.reply({ embeds: [successEmbed('Money Added', `Added ${sym}${fmt(amount)} to <@${targetId}>.\n**New Cash:** ${sym}${fmt(bal.cash)}`)], flags: 64 });
  }

  if (customId === 'economysetup_removemoney_modal') {
    const targetId = parseUserId(interaction.fields.getTextInputValue('user_id'));
    const amount   = parseInt(interaction.fields.getTextInputValue('amount'));
    if (!targetId) return interaction.reply({ embeds: [errorEmbed('Invalid user ID.')], flags: 64 });
    if (isNaN(amount) || amount < 1) return interaction.reply({ embeds: [errorEmbed('Invalid amount.')], flags: 64 });
    const bal = await getBalance(guildId, targetId, config2.startingBalance);
    bal.cash = Math.max(0, bal.cash - amount); await bal.save();
    await logTx(interaction, config2, `Removed **${sym}${fmt(amount)}** from <@${targetId}>'s cash.`);
    return interaction.reply({ embeds: [successEmbed('Money Removed', `Removed ${sym}${fmt(amount)} from <@${targetId}>.\n**New Cash:** ${sym}${fmt(bal.cash)}`)], flags: 64 });
  }

  if (customId === 'economysetup_resetmoney_modal') {
    const targetId = parseUserId(interaction.fields.getTextInputValue('user_id'));
    if (!targetId) return interaction.reply({ embeds: [errorEmbed('Invalid user ID.')], flags: 64 });
    const bal = await getBalance(guildId, targetId, config2.startingBalance);
    bal.cash = config2.startingBalance; bal.bank = 0; await bal.save();
    await logTx(interaction, config2, `Reset <@${targetId}>'s balance to ${sym}${fmt(config2.startingBalance)}.`);
    return interaction.reply({ embeds: [successEmbed('Balance Reset', `<@${targetId}>'s balance reset to ${sym}${fmt(config2.startingBalance)}.`)], flags: 64 });
  }
}

// ── Autocomplete handler ──────────────────────────────────────────────────────
export async function handleEconomyAutocomplete(interaction) {
  const { commandName, guildId, user } = interaction;
  const focused = interaction.options.getFocused(true);
  const query = (focused.value || '').toLowerCase();

  try {
    if (commandName === 'buy') {
      const config = await EconomyConfig.findOne({ guildId });
      const sym = config?.currencySymbol || '$';
      const guildItems = await EconomyStore.find({ guildId });
      const allItems = mergeShopItems(guildItems);
      const priced = allItems.filter(i => i.price != null);
      const filtered = query
        ? priced.filter(i => i.name.toLowerCase().includes(query) || (i.category || '').toLowerCase().includes(query))
        : priced;
      return interaction.respond(
        filtered.slice(0, 25).map(i => ({ name: `${i.name} - ${sym}${fmt(i.price)}`, value: i.name }))
      );
    }

    if (commandName === 'sell' || commandName === 'giveitems') {
      const inv = await EconomyInventory.findOne({ guildId, userId: user.id });
      const items = inv?.items || [];
      const filtered = query
        ? items.filter(i => i.itemName.toLowerCase().includes(query))
        : items;
      return interaction.respond(
        filtered.slice(0, 25).map(i => ({ name: `${i.itemName} (x${i.quantity})`, value: i.itemName }))
      );
    }

    if (commandName === 'use') {
      const inv = await EconomyInventory.findOne({ guildId, userId: user.id });
      const items = inv?.items || [];
      const filtered = query
        ? items.filter(i => i.itemName.toLowerCase().includes(query))
        : items;
      return interaction.respond(
        filtered.slice(0, 25).map(i => ({ name: `${i.itemName} (x${i.quantity})`, value: i.itemName }))
      );
    }

    return interaction.respond([]);
  } catch {
    return interaction.respond([]).catch(() => {});
  }
}
