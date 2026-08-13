import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } from 'discord.js';
import BusinessAccount from '../models/BusinessAccount.js';
import BusinessLoanConfig from '../models/BusinessLoanConfig.js';

const errEmbed = msg => new EmbedBuilder().setColor(0xf04747).setDescription(`❌ ${msg}`).setFooter({ text: 'RPM' });

export const data = new SlashCommandBuilder()
  .setName('businessloanpanel')
  .setDescription('Post or refresh the loan application panel for a business')
  .addStringOption(o => o.setName('business').setDescription('Business name').setRequired(true).setAutocomplete(true))
  .addChannelOption(o => o
    .setName('channel')
    .setDescription('Channel to post the panel in')
    .setRequired(true)
    .addChannelTypes(ChannelType.GuildText));

export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused().toLowerCase();
  const accounts = await BusinessAccount.find({ guildId: interaction.guildId }).lean();
  const choices = accounts
    .filter(a => a.name.toLowerCase().includes(focused))
    .slice(0, 25)
    .map(a => ({ name: a.name, value: a.name }));
  return interaction.respond(choices);
}

export async function execute(interaction) {
  const isAdmin = interaction.member?.permissions?.has('Administrator');
  if (!isAdmin) {
    const { checkStaffPermission } = await import('../utils/permissions.js');
    const isStaff = await checkStaffPermission(interaction.guildId, interaction.member);
    if (!isStaff) return interaction.reply({ embeds: [errEmbed('You must be an admin or staff to post a loan panel.')], flags: 64 });
  }

  const bizName = interaction.options.getString('business');
  const channel = interaction.options.getChannel('channel');

  const account = await BusinessAccount.findOne({
    guildId: interaction.guildId,
    name: new RegExp(`^${bizName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
  }).lean();
  if (!account) return interaction.reply({ embeds: [errEmbed(`No business named **${bizName}** found.`)], flags: 64 });

  let loanConfig = await BusinessLoanConfig.findOne({ guildId: interaction.guildId, accountId: account.accountId });
  if (!loanConfig) {
    loanConfig = await BusinessLoanConfig.create({ guildId: interaction.guildId, accountId: account.accountId });
  }

  const types = [];
  if (loanConfig.personalLoansEnabled) types.push('Personal Loans');
  if (loanConfig.propertyLoansEnabled) types.push('Property Loans');

  const panelEmbed = new EmbedBuilder()
    .setColor(0x2d2d2d)
    .setTitle(`${account.name} — Loan Services`)
    .setDescription(
      (types.length ? `**Available:** ${types.join(' · ')}\n` : '') +
      `Apply for a loan directly through this panel.\n` +
      `-# You will be asked a few questions in your DMs.`,
    )
    .setFooter({ text: 'RPM' });

  if (loanConfig.panelImageUrl) panelEmbed.setImage(loanConfig.panelImageUrl);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`loan_apply_${account.accountId}`)
      .setLabel('Apply for a Loan')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📋'),
  );

  // Delete old panel message if it exists
  if (loanConfig.panelMessageId && loanConfig.panelChannelId) {
    try {
      const oldChannel = interaction.guild.channels.cache.get(loanConfig.panelChannelId)
        || await interaction.guild.channels.fetch(loanConfig.panelChannelId).catch(() => null);
      if (oldChannel) {
        const oldMsg = await oldChannel.messages.fetch(loanConfig.panelMessageId).catch(() => null);
        if (oldMsg) await oldMsg.delete().catch(() => {});
      }
    } catch { /* non-fatal */ }
  }

  const msg = await channel.send({ embeds: [panelEmbed], components: [row] });

  loanConfig.panelChannelId = channel.id;
  loanConfig.panelMessageId = msg.id;
  await loanConfig.save();

  return interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(0x2d2d2d)
      .setDescription(`✅ Loan panel for **${account.name}** posted in <#${channel.id}>.`)
      .setFooter({ text: 'RPM' })],
    flags: 64,
  });
}
