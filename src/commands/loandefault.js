import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import BusinessLoan from '../models/BusinessLoan.js';
import BusinessAccount from '../models/BusinessAccount.js';
import Config from '../models/Config.js';

const errEmbed = msg => new EmbedBuilder().setColor(0xf04747).setDescription(`❌ ${msg}`).setFooter({ text: 'RPM' });
const fmt = n => Number(n).toLocaleString();

export const data = new SlashCommandBuilder()
  .setName('loandefault')
  .setDescription('Mark an active loan as defaulted (staff only)')
  .addStringOption(o => o.setName('loan').setDescription('Select the loan to default').setRequired(true).setAutocomplete(true));

export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused().toLowerCase();
  const loans = await BusinessLoan.find({ guildId: interaction.guildId, status: 'active' }).lean();
  const accountIds = [...new Set(loans.map(l => l.lenderAccountId))];
  const accounts = await BusinessAccount.find({ accountId: { $in: accountIds } }).lean();
  const accountMap = Object.fromEntries(accounts.map(a => [a.accountId, a.name]));

  const choices = loans
    .map(l => {
      const bankName = accountMap[l.lenderAccountId] || 'Bank';
      const label = `${bankName} → <@${l.borrowerUserId}> — ${l.type} — $${fmt(l.totalOwed - l.amountPaid)} remaining`;
      return { name: label.slice(0, 100), value: l.loanId };
    })
    .filter(c => c.name.toLowerCase().includes(focused))
    .slice(0, 25);

  return interaction.respond(choices);
}

export async function execute(interaction) {
  const isAdmin = interaction.member?.permissions?.has('Administrator');
  if (!isAdmin) {
    const { checkStaffPermission } = await import('../utils/permissions.js');
    const isStaff = await checkStaffPermission(interaction.guildId, interaction.member);
    if (!isStaff) return interaction.reply({ embeds: [errEmbed('You must be staff to default a loan.')], flags: 64 });
  }

  const loanId = interaction.options.getString('loan');
  const loan = await BusinessLoan.findOne({ loanId, guildId: interaction.guildId });
  if (!loan) return interaction.reply({ embeds: [errEmbed('Loan not found.')], flags: 64 });
  if (loan.status !== 'active') return interaction.reply({ embeds: [errEmbed(`This loan is already **${loan.status}**.`)], flags: 64 });

  const [account, config] = await Promise.all([
    BusinessAccount.findOne({ accountId: loan.lenderAccountId }).lean(),
    Config.findOne({ guildId: interaction.guildId }).lean(),
  ]);
  const sym = config?.currencySymbol || '$';
  const remaining = loan.totalOwed - loan.amountPaid;

  loan.status = 'defaulted';
  await loan.save();

  // Notify borrower
  try {
    const borrower = await interaction.client.users.fetch(loan.borrowerUserId);
    await borrower.send({
      embeds: [new EmbedBuilder()
        .setColor(0xf04747)
        .setTitle('⚠️ Loan Defaulted')
        .setDescription(
          `Your **${loan.type} loan** with **${account?.name || 'the bank'}** has been marked as **defaulted**.\n\n` +
          `**Outstanding:** ${sym}${fmt(remaining)}\n` +
          `Please contact the lender if you believe this is an error.`,
        )
        .setFooter({ text: 'RPM' })],
    });
  } catch { /* DMs closed */ }

  return interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(0xf04747)
      .setTitle('Loan Defaulted')
      .setDescription(
        `Loan for <@${loan.borrowerUserId}> with **${account?.name || 'the bank'}** has been marked as defaulted.\n` +
        `-# ${sym}${fmt(remaining)} written off.`,
      )
      .setFooter({ text: 'RPM' })],
    flags: 64,
  });
}
