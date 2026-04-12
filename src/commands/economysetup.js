import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import EconomyConfig from '../models/EconomyConfig.js';
import EconomyBalance from '../models/EconomyBalance.js';
import EconomyStore from '../models/EconomyStore.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('economysetup')
  .setDescription('Configure the economy system (Admin/Staff)')
  // ── Enable / Disable ────────────────────────────────────────────────────────
  .addSubcommand(sub =>
    sub.setName('enable').setDescription('Enable the economy system on this server')
  )
  .addSubcommand(sub =>
    sub.setName('disable').setDescription('Disable the economy system on this server')
  )
  // ── General settings ────────────────────────────────────────────────────────
  .addSubcommand(sub =>
    sub.setName('currency').setDescription('Set currency symbol and starting balance')
      .addStringOption(o => o.setName('symbol').setDescription('Currency symbol (e.g. $ or 💰)').setRequired(true))
      .addIntegerOption(o => o.setName('starting').setDescription('Starting balance for new members').setMinValue(0))
      .addIntegerOption(o => o.setName('max').setDescription('Maximum balance allowed').setMinValue(1))
  )
  .addSubcommand(sub =>
    sub.setName('setlogchannel').setDescription('Set the channel for economy transaction logs')
      .addChannelOption(o => o.setName('channel').setDescription('Log channel').setRequired(true))
  )
  .addSubcommand(sub =>
    sub.setName('view').setDescription('View current economy configuration')
  )
  // ── Admin money management ──────────────────────────────────────────────────
  .addSubcommand(sub =>
    sub.setName('addmoney').setDescription('Add money to a user\'s cash')
      .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
      .addIntegerOption(o => o.setName('amount').setDescription('Amount to add').setRequired(true).setMinValue(1))
  )
  .addSubcommand(sub =>
    sub.setName('removemoney').setDescription('Remove money from a user\'s cash')
      .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
      .addIntegerOption(o => o.setName('amount').setDescription('Amount to remove').setRequired(true).setMinValue(1))
  )
  .addSubcommand(sub =>
    sub.setName('resetmoney').setDescription('Reset a user\'s balance to the starting balance')
      .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
  )
  // ── Work / Crime / Rob / Gambling ───────────────────────────────────────────
  .addSubcommand(sub =>
    sub.setName('work').setDescription('Configure work command settings')
      .addBooleanOption(o => o.setName('enabled').setDescription('Enable or disable work'))
      .addIntegerOption(o => o.setName('cooldown').setDescription('Work cooldown in minutes').setMinValue(1))
      .addIntegerOption(o => o.setName('minpay').setDescription('Minimum payout').setMinValue(1))
      .addIntegerOption(o => o.setName('maxpay').setDescription('Maximum payout').setMinValue(1))
      .addStringOption(o => o.setName('reply').setDescription('Add custom work reply (use | to separate multiple)'))
  )
  .addSubcommand(sub =>
    sub.setName('crime').setDescription('Configure crime command settings')
      .addBooleanOption(o => o.setName('enabled').setDescription('Enable or disable crime'))
      .addIntegerOption(o => o.setName('cooldown').setDescription('Crime cooldown in minutes').setMinValue(1))
      .addIntegerOption(o => o.setName('successrate').setDescription('Success rate percentage (1-100)').setMinValue(1).setMaxValue(100))
      .addIntegerOption(o => o.setName('minpay').setDescription('Minimum payout on success').setMinValue(1))
      .addIntegerOption(o => o.setName('maxpay').setDescription('Maximum payout on success').setMinValue(1))
      .addIntegerOption(o => o.setName('finerate').setDescription('Fine % of max payout on failure').setMinValue(0).setMaxValue(100))
  )
  .addSubcommand(sub =>
    sub.setName('rob').setDescription('Configure rob command settings')
      .addBooleanOption(o => o.setName('enabled').setDescription('Enable or disable rob'))
      .addIntegerOption(o => o.setName('cooldown').setDescription('Rob cooldown in minutes').setMinValue(1))
      .addIntegerOption(o => o.setName('successrate').setDescription('Success rate percentage (1-100)').setMinValue(1).setMaxValue(100))
      .addIntegerOption(o => o.setName('maxsteal').setDescription('Max % of target cash that can be stolen').setMinValue(1).setMaxValue(100))
  )
  .addSubcommand(sub =>
    sub.setName('gambling').setDescription('Configure gambling settings')
      .addBooleanOption(o => o.setName('enabled').setDescription('Enable or disable gambling'))
      .addIntegerOption(o => o.setName('minbet').setDescription('Minimum bet').setMinValue(1))
      .addIntegerOption(o => o.setName('maxbet').setDescription('Maximum bet').setMinValue(1))
      .addIntegerOption(o => o.setName('cooldown').setDescription('Gambling cooldown in minutes').setMinValue(0))
  )
  // ── Role income ─────────────────────────────────────────────────────────────
  .addSubcommand(sub =>
    sub.setName('roleincome').setDescription('Add or update role income (members earn money periodically)')
      .addRoleOption(o => o.setName('role').setDescription('The role to grant income to').setRequired(true))
      .addIntegerOption(o => o.setName('amount').setDescription('Income amount per collection').setRequired(true).setMinValue(1))
      .addIntegerOption(o => o.setName('cooldown').setDescription('Collection cooldown in hours').setRequired(true).setMinValue(1))
  )
  .addSubcommand(sub =>
    sub.setName('removeroleincome').setDescription('Remove role income from a role')
      .addRoleOption(o => o.setName('role').setDescription('The role to remove income from').setRequired(true))
  )
  // ── Chat money ──────────────────────────────────────────────────────────────
  .addSubcommand(sub =>
    sub.setName('chatmoney').setDescription('Configure chat money (earn money by chatting)')
      .addBooleanOption(o => o.setName('enabled').setDescription('Enable or disable chat money'))
      .addIntegerOption(o => o.setName('min').setDescription('Min amount per message').setMinValue(1))
      .addIntegerOption(o => o.setName('max').setDescription('Max amount per message').setMinValue(1))
      .addIntegerOption(o => o.setName('cooldown').setDescription('Cooldown in seconds between earnings').setMinValue(1))
      .addChannelOption(o => o.setName('channel').setDescription('Restrict to this channel (leave empty to allow all)'))
  )
  // ── Store management ────────────────────────────────────────────────────────
  .addSubcommand(sub =>
    sub.setName('storeadd').setDescription('Add an item to the store')
      .addStringOption(o => o.setName('name').setDescription('Item name').setRequired(true))
      .addIntegerOption(o => o.setName('price').setDescription('Price in currency').setRequired(true).setMinValue(1))
      .addStringOption(o => o.setName('description').setDescription('Item description').setRequired(true))
      .addBooleanOption(o => o.setName('usable').setDescription('Can this item be used?'))
      .addStringOption(o => o.setName('useeffect').setDescription('What happens when this item is used?'))
  )
  .addSubcommand(sub =>
    sub.setName('storeremove').setDescription('Remove an item from the store')
      .addStringOption(o => o.setName('name').setDescription('Item name').setRequired(true))
  )
  .addSubcommand(sub =>
    sub.setName('storeedit').setDescription('Edit an existing store item')
      .addStringOption(o => o.setName('name').setDescription('Item name').setRequired(true))
      .addIntegerOption(o => o.setName('price').setDescription('New price').setMinValue(1))
      .addStringOption(o => o.setName('description').setDescription('New description'))
      .addBooleanOption(o => o.setName('usable').setDescription('Can this item be used?'))
      .addStringOption(o => o.setName('useeffect').setDescription('What happens when used?'))
  )
  .addSubcommand(sub =>
    sub.setName('storelist').setDescription('View all store items')
  );

// ─── Execute ─────────────────────────────────────────────────────────────────

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  // enable / disable only require Discord Administrator or Manage Guild — no staff config needed
  if (sub === 'enable' || sub === 'disable') {
    const hasAdminPerm =
      interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
      interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);

    if (!hasAdminPerm) {
      return interaction.reply({ embeds: [errorEmbed('You need the **Administrator** or **Manage Server** permission to enable or disable the economy system.')], flags: 64 });
    }

    try {
      if (sub === 'enable') {
        let config = await EconomyConfig.findOne({ guildId });
        if (!config) config = new EconomyConfig({ guildId });
        config.enabled = true;
        await config.save();
        return interaction.reply({ embeds: [successEmbed('Economy Enabled', 'The economy system is now **enabled**. Members can use `/economy` commands.')], flags: 64 });
      }

      if (sub === 'disable') {
        let config = await EconomyConfig.findOne({ guildId });
        if (!config) return interaction.reply({ embeds: [errorEmbed('The economy system has not been set up on this server.')], flags: 64 });
        config.enabled = false;
        await config.save();
        return interaction.reply({ embeds: [successEmbed('Economy Disabled', 'The economy system has been **disabled**. Members can no longer use `/economy` commands.')], flags: 64 });
      }
    } catch (err) {
      console.error('[economysetup enable/disable]', err);
      return interaction.reply({ embeds: [errorEmbed('An error occurred while updating the economy status.')], flags: 64 });
    }
  }

  // all other subcommands require staff permission
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({ embeds: [errorEmbed('You do not have permission to use this command.')], flags: 64 });
  }

  try {
    // all other subcommands require an existing config
    let config = await EconomyConfig.findOne({ guildId });
    if (!config) config = new EconomyConfig({ guildId });

    // ── currency ──────────────────────────────────────────────────────────────
    if (sub === 'currency') {
      const symbol = interaction.options.getString('symbol');
      const starting = interaction.options.getInteger('starting');
      const max = interaction.options.getInteger('max');
      config.currencySymbol = symbol;
      if (starting !== null) config.startingBalance = starting;
      if (max !== null) config.maxBalance = max;
      await config.save();
      return interaction.reply({
        embeds: [successEmbed('Currency Updated', `**Symbol:** ${symbol}\n**Starting Balance:** ${config.startingBalance}\n**Max Balance:** ${config.maxBalance}`)],
        flags: 64,
      });
    }

    // ── setlogchannel ─────────────────────────────────────────────────────────
    if (sub === 'setlogchannel') {
      const channel = interaction.options.getChannel('channel');
      config.logChannelId = channel.id;
      await config.save();
      return interaction.reply({ embeds: [successEmbed('Log Channel Set', `Economy logs will be sent to ${channel}.`)], flags: 64 });
    }

    // ── view ──────────────────────────────────────────────────────────────────
    if (sub === 'view') {
      const sym = config.currencySymbol;
      const desc =
        `### Status\n**Enabled:** ${config.enabled ? 'Yes' : 'No'}\n\n` +
        `### Currency\n**Symbol:** ${sym}  **Starting:** ${sym}${config.startingBalance}  **Max:** ${sym}${config.maxBalance}\n\n` +
        `### Work\n**Enabled:** ${config.work.enabled}  **Cooldown:** ${config.work.cooldown}m  **Pay:** ${sym}${config.work.minPayout}-${sym}${config.work.maxPayout}\n\n` +
        `### Crime\n**Enabled:** ${config.crime.enabled}  **Cooldown:** ${config.crime.cooldown}m  **Success:** ${config.crime.successRate}%  **Pay:** ${sym}${config.crime.minPayout}-${sym}${config.crime.maxPayout}\n\n` +
        `### Rob\n**Enabled:** ${config.rob.enabled}  **Cooldown:** ${config.rob.cooldown}m  **Success:** ${config.rob.successRate}%  **Max Steal:** ${config.rob.maxStealPercent}%\n\n` +
        `### Gambling\n**Enabled:** ${config.gambling.enabled}  **Bet:** ${sym}${config.gambling.minBet}-${sym}${config.gambling.maxBet}  **Cooldown:** ${config.gambling.cooldown}m\n\n` +
        `### Role Income\n${config.roleIncome.length === 0 ? 'None configured.' : config.roleIncome.map(r => `<@&${r.roleId}>: ${sym}${r.amount} every ${r.cooldown}h`).join('\n')}\n\n` +
        `### Chat Money\n**Enabled:** ${config.chatMoney.enabled}  **Amount:** ${sym}${config.chatMoney.minAmount}-${sym}${config.chatMoney.maxAmount}  **Cooldown:** ${config.chatMoney.cooldown}s`;
      return interaction.reply({ embeds: [{ color: 0x2d2d2d, title: 'Economy Configuration', description: desc, footer: { text: 'RPM' } }], flags: 64 });
    }

    // ── addmoney ──────────────────────────────────────────────────────────────
    if (sub === 'addmoney') {
      const target = interaction.options.getUser('user');
      const amount = interaction.options.getInteger('amount');
      const bal = await getOrCreateBalance(guildId, target.id, config.startingBalance);
      bal.cash = Math.min(bal.cash + amount, config.maxBalance);
      await bal.save();
      await logTransaction(interaction, config, `Added **${config.currencySymbol}${amount.toLocaleString()}** to ${target.username}'s cash.`);
      return interaction.reply({ embeds: [successEmbed('Money Added', `**User:** ${target.username}\n**Added:** ${config.currencySymbol}${amount.toLocaleString()}\n**New Cash:** ${config.currencySymbol}${bal.cash.toLocaleString()}`)], flags: 64 });
    }

    // ── removemoney ───────────────────────────────────────────────────────────
    if (sub === 'removemoney') {
      const target = interaction.options.getUser('user');
      const amount = interaction.options.getInteger('amount');
      const bal = await getOrCreateBalance(guildId, target.id, config.startingBalance);
      bal.cash = Math.max(0, bal.cash - amount);
      await bal.save();
      await logTransaction(interaction, config, `Removed **${config.currencySymbol}${amount.toLocaleString()}** from ${target.username}'s cash.`);
      return interaction.reply({ embeds: [successEmbed('Money Removed', `**User:** ${target.username}\n**Removed:** ${config.currencySymbol}${amount.toLocaleString()}\n**New Cash:** ${config.currencySymbol}${bal.cash.toLocaleString()}`)], flags: 64 });
    }

    // ── resetmoney ────────────────────────────────────────────────────────────
    if (sub === 'resetmoney') {
      const target = interaction.options.getUser('user');
      const bal = await getOrCreateBalance(guildId, target.id, config.startingBalance);
      bal.cash = config.startingBalance;
      bal.bank = 0;
      await bal.save();
      await logTransaction(interaction, config, `Reset ${target.username}'s balance to ${config.currencySymbol}${config.startingBalance.toLocaleString()}.`);
      return interaction.reply({ embeds: [successEmbed('Balance Reset', `**User:** ${target.username}\n**Cash:** ${config.currencySymbol}${config.startingBalance.toLocaleString()}\n**Bank:** ${config.currencySymbol}0`)], flags: 64 });
    }

    // ── work ──────────────────────────────────────────────────────────────────
    if (sub === 'work') {
      const enabled = interaction.options.getBoolean('enabled');
      const cooldown = interaction.options.getInteger('cooldown');
      const minpay = interaction.options.getInteger('minpay');
      const maxpay = interaction.options.getInteger('maxpay');
      const reply = interaction.options.getString('reply');
      if (enabled !== null) config.work.enabled = enabled;
      if (cooldown !== null) config.work.cooldown = cooldown;
      if (minpay !== null) config.work.minPayout = minpay;
      if (maxpay !== null) config.work.maxPayout = maxpay;
      if (reply) config.work.customReplies.push(...reply.split('|').map(r => r.trim()).filter(Boolean));
      config.markModified('work');
      await config.save();
      return interaction.reply({
        embeds: [successEmbed('Work Settings Updated', `**Enabled:** ${config.work.enabled}\n**Cooldown:** ${config.work.cooldown}m\n**Pay:** ${config.currencySymbol}${config.work.minPayout} - ${config.currencySymbol}${config.work.maxPayout}\n**Custom Replies:** ${config.work.customReplies.length}`)],
        flags: 64,
      });
    }

    // ── crime ─────────────────────────────────────────────────────────────────
    if (sub === 'crime') {
      const enabled = interaction.options.getBoolean('enabled');
      const cooldown = interaction.options.getInteger('cooldown');
      const successRate = interaction.options.getInteger('successrate');
      const minpay = interaction.options.getInteger('minpay');
      const maxpay = interaction.options.getInteger('maxpay');
      const fineRate = interaction.options.getInteger('finerate');
      if (enabled !== null) config.crime.enabled = enabled;
      if (cooldown !== null) config.crime.cooldown = cooldown;
      if (successRate !== null) config.crime.successRate = successRate;
      if (minpay !== null) config.crime.minPayout = minpay;
      if (maxpay !== null) config.crime.maxPayout = maxpay;
      if (fineRate !== null) config.crime.fineRate = fineRate;
      config.markModified('crime');
      await config.save();
      return interaction.reply({
        embeds: [successEmbed('Crime Settings Updated', `**Enabled:** ${config.crime.enabled}\n**Cooldown:** ${config.crime.cooldown}m\n**Success Rate:** ${config.crime.successRate}%\n**Pay:** ${config.currencySymbol}${config.crime.minPayout} - ${config.currencySymbol}${config.crime.maxPayout}\n**Fine Rate:** ${config.crime.fineRate}%`)],
        flags: 64,
      });
    }

    // ── rob ───────────────────────────────────────────────────────────────────
    if (sub === 'rob') {
      const enabled = interaction.options.getBoolean('enabled');
      const cooldown = interaction.options.getInteger('cooldown');
      const successRate = interaction.options.getInteger('successrate');
      const maxSteal = interaction.options.getInteger('maxsteal');
      if (enabled !== null) config.rob.enabled = enabled;
      if (cooldown !== null) config.rob.cooldown = cooldown;
      if (successRate !== null) config.rob.successRate = successRate;
      if (maxSteal !== null) config.rob.maxStealPercent = maxSteal;
      config.markModified('rob');
      await config.save();
      return interaction.reply({
        embeds: [successEmbed('Rob Settings Updated', `**Enabled:** ${config.rob.enabled}\n**Cooldown:** ${config.rob.cooldown}m\n**Success Rate:** ${config.rob.successRate}%\n**Max Steal:** ${config.rob.maxStealPercent}% of target's cash`)],
        flags: 64,
      });
    }

    // ── gambling ──────────────────────────────────────────────────────────────
    if (sub === 'gambling') {
      const enabled = interaction.options.getBoolean('enabled');
      const minBet = interaction.options.getInteger('minbet');
      const maxBet = interaction.options.getInteger('maxbet');
      const cooldown = interaction.options.getInteger('cooldown');
      if (enabled !== null) config.gambling.enabled = enabled;
      if (minBet !== null) config.gambling.minBet = minBet;
      if (maxBet !== null) config.gambling.maxBet = maxBet;
      if (cooldown !== null) config.gambling.cooldown = cooldown;
      config.markModified('gambling');
      await config.save();
      return interaction.reply({
        embeds: [successEmbed('Gambling Settings Updated', `**Enabled:** ${config.gambling.enabled}\n**Min Bet:** ${config.currencySymbol}${config.gambling.minBet}\n**Max Bet:** ${config.currencySymbol}${config.gambling.maxBet}\n**Cooldown:** ${config.gambling.cooldown}m`)],
        flags: 64,
      });
    }

    // ── roleincome ────────────────────────────────────────────────────────────
    if (sub === 'roleincome') {
      const role = interaction.options.getRole('role');
      const amount = interaction.options.getInteger('amount');
      const cooldown = interaction.options.getInteger('cooldown');
      const existing = config.roleIncome.find(r => r.roleId === role.id);
      if (existing) { existing.amount = amount; existing.cooldown = cooldown; }
      else config.roleIncome.push({ roleId: role.id, amount, cooldown });
      config.markModified('roleIncome');
      await config.save();
      return interaction.reply({ embeds: [successEmbed('Role Income Set', `**Role:** ${role}\n**Amount:** ${config.currencySymbol}${amount.toLocaleString()}\n**Cooldown:** ${cooldown}h`)], flags: 64 });
    }

    // ── removeroleincome ──────────────────────────────────────────────────────
    if (sub === 'removeroleincome') {
      const role = interaction.options.getRole('role');
      config.roleIncome = config.roleIncome.filter(r => r.roleId !== role.id);
      config.markModified('roleIncome');
      await config.save();
      return interaction.reply({ embeds: [successEmbed('Role Income Removed', `Income removed for ${role}.`)], flags: 64 });
    }

    // ── chatmoney ─────────────────────────────────────────────────────────────
    if (sub === 'chatmoney') {
      const enabled = interaction.options.getBoolean('enabled');
      const min = interaction.options.getInteger('min');
      const max = interaction.options.getInteger('max');
      const cooldown = interaction.options.getInteger('cooldown');
      const channel = interaction.options.getChannel('channel');
      if (enabled !== null) config.chatMoney.enabled = enabled;
      if (min !== null) config.chatMoney.minAmount = min;
      if (max !== null) config.chatMoney.maxAmount = max;
      if (cooldown !== null) config.chatMoney.cooldown = cooldown;
      if (channel && !config.chatMoney.channels.includes(channel.id)) config.chatMoney.channels.push(channel.id);
      config.markModified('chatMoney');
      await config.save();
      return interaction.reply({
        embeds: [successEmbed('Chat Money Updated', `**Enabled:** ${config.chatMoney.enabled}\n**Amount:** ${config.currencySymbol}${config.chatMoney.minAmount}-${config.currencySymbol}${config.chatMoney.maxAmount}\n**Cooldown:** ${config.chatMoney.cooldown}s\n**Channels:** ${config.chatMoney.channels.length === 0 ? 'All' : config.chatMoney.channels.length}`)],
        flags: 64,
      });
    }

    // ── storeadd ──────────────────────────────────────────────────────────────
    if (sub === 'storeadd') {
      const name = interaction.options.getString('name');
      const price = interaction.options.getInteger('price');
      const description = interaction.options.getString('description');
      const usable = interaction.options.getBoolean('usable') ?? false;
      const useEffect = interaction.options.getString('useeffect') ?? '';
      const existing = await EconomyStore.findOne({ guildId, name: { $regex: new RegExp(`^${name}$`, 'i') } });
      if (existing) return interaction.reply({ embeds: [errorEmbed(`An item named **${name}** already exists.`)], flags: 64 });
      await EconomyStore.create({ guildId, name, price, description, usable, useEffect });
      return interaction.reply({ embeds: [successEmbed('Item Added', `**${name}** added to the store for ${config.currencySymbol}${price.toLocaleString()}.\n-# ${description}`)], flags: 64 });
    }

    // ── storeremove ───────────────────────────────────────────────────────────
    if (sub === 'storeremove') {
      const name = interaction.options.getString('name');
      const deleted = await EconomyStore.findOneAndDelete({ guildId, name: { $regex: new RegExp(`^${name}$`, 'i') } });
      if (!deleted) return interaction.reply({ embeds: [errorEmbed(`No item named **${name}** was found.`)], flags: 64 });
      return interaction.reply({ embeds: [successEmbed('Item Removed', `**${name}** has been removed from the store.`)], flags: 64 });
    }

    // ── storeedit ─────────────────────────────────────────────────────────────
    if (sub === 'storeedit') {
      const name = interaction.options.getString('name');
      const item = await EconomyStore.findOne({ guildId, name: { $regex: new RegExp(`^${name}$`, 'i') } });
      if (!item) return interaction.reply({ embeds: [errorEmbed(`No item named **${name}** was found.`)], flags: 64 });
      const price = interaction.options.getInteger('price');
      const description = interaction.options.getString('description');
      const usable = interaction.options.getBoolean('usable');
      const useEffect = interaction.options.getString('useeffect');
      if (price !== null) item.price = price;
      if (description) item.description = description;
      if (usable !== null) item.usable = usable;
      if (useEffect) item.useEffect = useEffect;
      await item.save();
      return interaction.reply({ embeds: [successEmbed('Item Updated', `**${item.name}** has been updated.`)], flags: 64 });
    }

    // ── storelist ─────────────────────────────────────────────────────────────
    if (sub === 'storelist') {
      const items = await EconomyStore.find({ guildId });
      if (items.length === 0) {
        return interaction.reply({ embeds: [errorEmbed('The store has no items. Use `/economysetup storeadd` to add some.')], flags: 64 });
      }
      const sym = config.currencySymbol;
      const desc = items.map((item, i) =>
        `**${i + 1}. ${item.name}** — ${sym}${item.price.toLocaleString()}\n-# ${item.description}${item.usable ? ' *(usable)*' : ''}`
      ).join('\n\n');
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x2d2d2d).setTitle('Store Items').setDescription(desc).setFooter({ text: 'RPM' })], flags: 64 });
    }

  } catch (err) {
    console.error('[economysetup]', err);
    return interaction.reply({ embeds: [errorEmbed('An error occurred.')], flags: 64 });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getOrCreateBalance(guildId, userId, startingBalance) {
  let bal = await EconomyBalance.findOne({ guildId, userId });
  if (!bal) bal = new EconomyBalance({ guildId, userId, cash: startingBalance, bank: 0 });
  return bal;
}

async function logTransaction(interaction, config, message) {
  if (!config.logChannelId) return;
  try {
    const ch = interaction.guild.channels.cache.get(config.logChannelId);
    if (!ch?.isTextBased()) return;
    await ch.send({
      embeds: [new EmbedBuilder().setColor(0x2d2d2d)
        .setTitle('Economy — Admin Action')
        .setDescription(`**By:** ${interaction.user.username}\n${message}`)
        .setTimestamp().setFooter({ text: 'RPM' })],
    });
  } catch {}
}
