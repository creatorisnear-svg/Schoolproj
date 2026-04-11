import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import EconomyStore from '../models/EconomyStore.js';
import EconomyConfig from '../models/EconomyConfig.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('storesetup')
  .setDescription('Manage the economy store (Admin/Staff)')
  .addSubcommand(sub =>
    sub.setName('add')
      .setDescription('Add an item to the store')
      .addStringOption(o => o.setName('name').setDescription('Item name').setRequired(true))
      .addIntegerOption(o => o.setName('price').setDescription('Price in currency').setRequired(true).setMinValue(1))
      .addStringOption(o => o.setName('description').setDescription('Item description').setRequired(true))
      .addBooleanOption(o => o.setName('usable').setDescription('Can this item be used?'))
      .addStringOption(o => o.setName('useeffect').setDescription('What happens when this item is used?'))
  )
  .addSubcommand(sub =>
    sub.setName('remove')
      .setDescription('Remove an item from the store')
      .addStringOption(o => o.setName('name').setDescription('Item name').setRequired(true))
  )
  .addSubcommand(sub =>
    sub.setName('edit')
      .setDescription('Edit an existing store item')
      .addStringOption(o => o.setName('name').setDescription('Item name').setRequired(true))
      .addIntegerOption(o => o.setName('price').setDescription('New price').setMinValue(1))
      .addStringOption(o => o.setName('description').setDescription('New description'))
      .addBooleanOption(o => o.setName('usable').setDescription('Can this item be used?'))
      .addStringOption(o => o.setName('useeffect').setDescription('What happens when used?'))
  )
  .addSubcommand(sub =>
    sub.setName('list')
      .setDescription('View all store items')
  );

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({ embeds: [errorEmbed('You do not have permission to use this command.')], flags: 64 });
  }

  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  try {
    if (sub === 'add') {
      const name = interaction.options.getString('name');
      const price = interaction.options.getInteger('price');
      const description = interaction.options.getString('description');
      const usable = interaction.options.getBoolean('usable') ?? false;
      const useEffect = interaction.options.getString('useeffect') ?? '';

      const existing = await EconomyStore.findOne({ guildId, name: { $regex: new RegExp(`^${name}$`, 'i') } });
      if (existing) return interaction.reply({ embeds: [errorEmbed(`An item named **${name}** already exists.`)], flags: 64 });

      const config = await EconomyConfig.findOne({ guildId });
      const sym = config?.currencySymbol ?? '$';

      await EconomyStore.create({ guildId, name, price, description, usable, useEffect });
      return interaction.reply({
        embeds: [successEmbed('Item Added', `**${name}** has been added to the store for ${sym}${price.toLocaleString()}.\n-# ${description}`)],
        flags: 64,
      });
    }

    if (sub === 'remove') {
      const name = interaction.options.getString('name');
      const deleted = await EconomyStore.findOneAndDelete({ guildId, name: { $regex: new RegExp(`^${name}$`, 'i') } });
      if (!deleted) return interaction.reply({ embeds: [errorEmbed(`No item named **${name}** was found.`)], flags: 64 });
      return interaction.reply({ embeds: [successEmbed('Item Removed', `**${name}** has been removed from the store.`)], flags: 64 });
    }

    if (sub === 'edit') {
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

    if (sub === 'list') {
      const items = await EconomyStore.find({ guildId });
      const config = await EconomyConfig.findOne({ guildId });
      const sym = config?.currencySymbol ?? '$';

      if (items.length === 0) {
        return interaction.reply({ embeds: [errorEmbed('The store has no items. Use `/storesetup add` to add some.')], flags: 64 });
      }

      const desc = items.map((item, i) =>
        `**${i + 1}. ${item.name}** — ${sym}${item.price.toLocaleString()}\n-# ${item.description}${item.usable ? ' *(usable)*' : ''}`
      ).join('\n\n');

      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0x2d2d2d).setTitle('Store Items').setDescription(desc).setFooter({ text: 'RPM' })],
        flags: 64,
      });
    }
  } catch (err) {
    console.error('[storesetup]', err);
    return interaction.reply({ embeds: [errorEmbed('An error occurred.')], flags: 64 });
  }
}
