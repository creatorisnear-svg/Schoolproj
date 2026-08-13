import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import BusinessLoan from '../models/BusinessLoan.js';
import BusinessAccount from '../models/BusinessAccount.js';
import BusinessTransaction from '../models/BusinessTransaction.js';
import EconomyBalance from '../models/EconomyBalance.js';
import Config from '../models/Config.js';

const errEmbed = msg => new EmbedBuilder().setColor(0xf04747).setDescription(`❌ ${msg}`).setFooter({ text: 'RPM' });
const fmt = n => Number(n).toLocaleString();

export const data = new SlashCommandBuilder()
  .setName('loanpay')
  .setDescription('Make a payment toward one of your active loans')
  .addStringOption(o => o.setName('loan').setDescription('Select the loan to pay').setRequired(true).setAutocomplete(true))
  .addIntegerOption(o => o.setName('amount').setDescription('Amount to pay').setRequired(true).setMinValue(1));

export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused().toLowerCase();
  const loans = await BusinessLoan.find({
    guildId: interaction.guildId,
    borrowerUserId: interaction.user.id,
    status: 'active',
  }).lean();

  const accountIds = [...new Set(loans.map(l => l.lenderAccountId))];
  const accounts = await BusinessAccount.find({ accountId: { $in: accountIds } }).lean();
  const accountMap = Object.fromEntries(accounts.map(a => [a.accountId, a.name]));

  const config = await Config.findOne({ guildId: interaction.guildId }).lean();
  const sym = config?.currencySymbol || '$';

  const choices = loans
    .map(l => {
      const remaining = l.totalOwed - l.amountPaid;
      const bankName = accountMap[l.lenderAccountId] || 'Bank';
      const label = `${bankName} — ${l.type === 'property' ? 'Property' : 'Personal'} — ${sym}${fmt(remaining)} remaining`;
      return { name: label.slice(0, 100), value: l.loanId };
    })
    .filter(c => c.name.toLowerCase().includes(focused))
    .slice(0, 25);

  return interaction.respond(choices);
}

export async function execute(interaction) {
  const loanId = interaction.options.getString('loan');
  const amount = interaction.options.getInteger('amount');

  const loan = await BusinessLoan.findOne({ loanId, guildId: interaction.guildId, borrowerUserId: interaction.user.id });
  if (!loan) return interaction.reply({ embeds: [errEmbed('Loan not found or does not belong to you.')], flags: 64 });
  if (loan.status !== 'active') return interaction.reply({ embeds: [errEmbed(`This loan is already **${loan.status}**.`)], flags: 64 });

  const remaining = loan.totalOwed - loan.amountPaid;
  if (amount > remaining) {
    return interaction.reply({ embeds: [errEmbed(`You only owe **$${fmt(remaining)}** on this loan. Pay that amount or less.`)], flags: 64 });
  }

  const config = await Config.findOne({ guildId: interaction.guildId }).lean();
  const sym = config?.currencySymbol || '$';

  const bal = await EconomyBalance.findOne({ guildId: interaction.guildId, userId: interaction.user.id });
  if (!bal || bal.cash < amount) {
    return interaction.reply({ embeds: [errEmbed(`You don't have enough cash. You have **${sym}${fmt(bal?.cash || 0)}** and need **${sym}${fmt(amount)}**.`)], flags: 64 });
  }

  const account = await BusinessAccount.findOne({ accountId: loan.lenderAccountId, guildId: interaction.guildId });
  if (!account) return interaction.reply({ embeds: [errEmbed('The lending business account could not be found.')], flags: 64 });

  // Transfer
  bal.cash -= amount;
  account.balance += amount;
  loan.amountPaid += amount;

  const isPaidOff = loan.amountPaid >= loan.totalOwed;
  if (isPaidOff) loan.status = 'paid';

  await Promise.all([
    bal.save(),
    account.save(),
    loan.save(),
    BusinessTransaction.create({
      guildId: interaction.guildId,
      accountId: account.accountId,
      type: 'loan_repayment',
      userId: interaction.user.id,
      username: interaction.user.username,
      amount,
      note: `Loan repayment from ${interaction.user.username}`,
    }),
  ]);

  const newRemaining = loan.totalOwed - loan.amountPaid;

  return interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(isPaidOff ? 0x43b581 : 0x2d2d2d)
      .setTitle(isPaidOff ? '🎉 Loan Paid Off!' : 'Payment Made')
      .setDescription(
        isPaidOff
          ? `Your **${loan.type} loan** with **${account.name}** has been fully paid off!\n\n**Paid:** ${sym}${fmt(amount)}`
          : `**Paid:** ${sym}${fmt(amount)}\n**Remaining:** ${sym}${fmt(newRemaining)}\n**Due:** <t:${Math.floor(loan.dueAt.getTime() / 1000)}:f>`,
      )
      .setFooter({ text: 'RPM' })],
    flags: 64,
  });
}
