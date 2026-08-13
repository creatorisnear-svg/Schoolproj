import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import BusinessLoan from '../models/BusinessLoan.js';
import BusinessAccount from '../models/BusinessAccount.js';
import Config from '../models/Config.js';

const errEmbed = msg => new EmbedBuilder().setColor(0xf04747).setDescription(`❌ ${msg}`).setFooter({ text: 'RPM' });
const fmt = n => Number(n).toLocaleString();

export const data = new SlashCommandBuilder()
  .setName('businessloans')
  .setDescription('View all loans issued by a business')
  .addStringOption(o => o.setName('business').setDescription('Business name').setRequired(true).setAutocomplete(true))
  .addStringOption(o => o
    .setName('status')
    .setDescription('Filter by status (default: all)')
    .setRequired(false)
    .addChoices(
      { name: 'All', value: 'all' },
      { name: 'Active', value: 'active' },
      { name: 'Paid', value: 'paid' },
      { name: 'Defaulted', value: 'defaulted' },
    ));

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
    if (!isStaff) return interaction.reply({ embeds: [errEmbed('You must be staff to view business loan records.')], flags: 64 });
  }

  const bizName   = interaction.options.getString('business');
  const statusFilter = interaction.options.getString('status') || 'all';

  const account = await BusinessAccount.findOne({
    guildId: interaction.guildId,
    name: new RegExp(`^${bizName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
  }).lean();
  if (!account) return interaction.reply({ embeds: [errEmbed(`No business named **${bizName}** found.`)], flags: 64 });

  const query = { guildId: interaction.guildId, lenderAccountId: account.accountId };
  if (statusFilter !== 'all') query.status = statusFilter;

  const [loans, config] = await Promise.all([
    BusinessLoan.find(query).sort({ issuedAt: -1 }).limit(25).lean(),
    Config.findOne({ guildId: interaction.guildId }).lean(),
  ]);

  const sym = config?.currencySymbol || '$';

  if (!loans.length) {
    return interaction.reply({ embeds: [errEmbed(`No ${statusFilter !== 'all' ? statusFilter + ' ' : ''}loans found for **${account.name}**.`)], flags: 64 });
  }

  const statusEmoji = { active: '🟡', paid: '✅', defaulted: '🔴' };

  const lines = loans.map(l => {
    const remaining = l.totalOwed - l.amountPaid;
    return (
      `${statusEmoji[l.status] || '❓'} **${l.type === 'property' ? 'Property' : 'Personal'}** · <@${l.borrowerUserId}>\n` +
      `-# ${sym}${fmt(l.principal)} principal · ${sym}${fmt(remaining)} remaining · ${l.interestRate}% · Due <t:${Math.floor(l.dueAt.getTime() / 1000)}:d>`
    );
  });

  const active    = loans.filter(l => l.status === 'active').length;
  const totalOwed = loans.filter(l => l.status === 'active').reduce((s, l) => s + (l.totalOwed - l.amountPaid), 0);

  return interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(0x2d2d2d)
      .setTitle(`${account.name} — Loan Portfolio`)
      .setDescription(lines.join('\n\n'))
      .setFooter({ text: `${active} active · ${sym}${fmt(totalOwed)} outstanding · RPM` })],
    flags: 64,
  });
}
