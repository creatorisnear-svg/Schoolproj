import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import BusinessAccount from '../models/BusinessAccount.js';
import BusinessLoanConfig from '../models/BusinessLoanConfig.js';

const errEmbed = msg => new EmbedBuilder().setColor(0xf04747).setDescription(`❌ ${msg}`).setFooter({ text: 'RPM' });
const fmt = n => Number(n).toLocaleString();

export const data = new SlashCommandBuilder()
  .setName('businessloanconfig')
  .setDescription('Configure the loan system for a business bank')
  .addStringOption(o => o.setName('business').setDescription('Business name').setRequired(true).setAutocomplete(true))
  .addChannelOption(o => o.setName('review-channel').setDescription('Channel where applications are posted for review').setRequired(false))
  .addStringOption(o => o.setName('banner-url').setDescription('Banner image URL shown on the loan panel').setRequired(false))
  .addIntegerOption(o => o.setName('personal-max').setDescription('Max personal loan amount').setRequired(false).setMinValue(1))
  .addIntegerOption(o => o.setName('property-max').setDescription('Max property loan amount').setRequired(false).setMinValue(1))
  .addNumberOption(o => o.setName('default-rate').setDescription('Default annual interest rate % (e.g. 10 for 10%)').setRequired(false).setMinValue(0).setMaxValue(1000))
  .addBooleanOption(o => o.setName('personal-loans').setDescription('Enable or disable personal loans').setRequired(false))
  .addBooleanOption(o => o.setName('property-loans').setDescription('Enable or disable property loans').setRequired(false))
  .addRoleOption(o => o.setName('ping-role').setDescription('Role to ping when an application comes in').setRequired(false));

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
    if (!isStaff) return interaction.reply({ embeds: [errEmbed('You must be an admin or staff to use this command.')], flags: 64 });
  }

  const bizName = interaction.options.getString('business');
  const account = await BusinessAccount.findOne({
    guildId: interaction.guildId,
    name: new RegExp(`^${bizName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
  }).lean();
  if (!account) return interaction.reply({ embeds: [errEmbed(`No business named **${bizName}** found.`)], flags: 64 });

  const reviewChannel  = interaction.options.getChannel('review-channel');
  const bannerUrl      = interaction.options.getString('banner-url');
  const personalMax    = interaction.options.getInteger('personal-max');
  const propertyMax    = interaction.options.getInteger('property-max');
  const defaultRate    = interaction.options.getNumber('default-rate');
  const personalLoans  = interaction.options.getBoolean('personal-loans');
  const propertyLoans  = interaction.options.getBoolean('property-loans');
  const pingRole       = interaction.options.getRole('ping-role');

  const setFields = { guildId: interaction.guildId, accountId: account.accountId };
  if (reviewChannel !== null) setFields.reviewChannelId = reviewChannel.id;
  if (bannerUrl      !== null) setFields.panelImageUrl   = bannerUrl;
  if (personalMax    !== null) setFields.personalLoanMax = personalMax;
  if (propertyMax    !== null) setFields.propertyLoanMax = propertyMax;
  if (defaultRate    !== null) setFields.defaultInterestRate = defaultRate;
  if (personalLoans  !== null) setFields.personalLoansEnabled = personalLoans;
  if (propertyLoans  !== null) setFields.propertyLoansEnabled = propertyLoans;

  let loanConfig = await BusinessLoanConfig.findOneAndUpdate(
    { guildId: interaction.guildId, accountId: account.accountId },
    { $set: setFields },
    { upsert: true, new: true },
  );

  if (pingRole !== null && !loanConfig.reviewPingRoleIds.includes(pingRole.id)) {
    loanConfig.reviewPingRoleIds.push(pingRole.id);
    await loanConfig.save();
  }

  return interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(0x2d2d2d)
      .setTitle(`${account.name} — Loan Config`)
      .setDescription(
        `**Review Channel:** ${loanConfig.reviewChannelId ? `<#${loanConfig.reviewChannelId}>` : 'Not set'}\n` +
        `**Personal Loans:** ${loanConfig.personalLoansEnabled ? `✅ Enabled (max $${fmt(loanConfig.personalLoanMax)})` : '❌ Disabled'}\n` +
        `**Property Loans:** ${loanConfig.propertyLoansEnabled ? `✅ Enabled (max $${fmt(loanConfig.propertyLoanMax)})` : '❌ Disabled'}\n` +
        `**Default Rate:** ${loanConfig.defaultInterestRate}% annual\n` +
        `**Panel Banner:** ${loanConfig.panelImageUrl ? loanConfig.panelImageUrl : 'None'}\n` +
        `**Ping Roles:** ${loanConfig.reviewPingRoleIds.length ? loanConfig.reviewPingRoleIds.map(r => `<@&${r}>`).join(', ') : 'None'}\n\n` +
        `-# Use \`/businessloanpanel\` to post the application panel in a channel.`,
      )
      .setFooter({ text: 'RPM' })],
    flags: 64,
  });
}
