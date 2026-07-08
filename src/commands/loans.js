import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import BusinessLoan from '../models/BusinessLoan.js';
import BusinessAccount from '../models/BusinessAccount.js';
import Config from '../models/Config.js';

const errEmbed = msg => new EmbedBuilder().setColor(0xf04747).setDescription(`❌ ${msg}`).setFooter({ text: 'RPM' });
const fmt = n => Number(n).toLocaleString();

export const data = new SlashCommandBuilder()
  .setName('loans')
  .setDescription('View your active loans')
  .addUserOption(o => o.setName('user').setDescription("View another member's loans (staff only)").setRequired(false));

export async function execute(interaction) {
  const targetUser = interaction.options.getUser('user');

  if (targetUser && targetUser.id !== interaction.user.id) {
    const isAdmin = interaction.member?.permissions?.has('Administrator');
    if (!isAdmin) {
      const { checkStaffPermission } = await import('../utils/permissions.js');
      const isStaff = await checkStaffPermission(interaction.guildId, interaction.member);
      if (!isStaff) return interaction.reply({ embeds: [errEmbed('You must be staff to view another member\'s loans.')], flags: 64 });
    }
  }

  const target = targetUser || interaction.user;
  const isSelf = target.id === interaction.user.id;

  const [loans, config] = await Promise.all([
    BusinessLoan.find({ guildId: interaction.guildId, borrowerUserId: target.id }).sort({ status: 1, dueAt: 1 }).lean(),
    Config.findOne({ guildId: interaction.guildId }).lean(),
  ]);

  const sym = config?.currencySymbol || '$';

  if (!loans.length) {
    return interaction.reply({
      embeds: [errEmbed(isSelf ? 'You have no loans.' : `**${target.username}** has no loans.`)],
      flags: 64,
    });
  }

  const accountIds = [...new Set(loans.map(l => l.lenderAccountId))];
  const accounts = await BusinessAccount.find({ accountId: { $in: accountIds } }).lean();
  const accountMap = Object.fromEntries(accounts.map(a => [a.accountId, a.name]));

  const statusEmoji = { active: '🟡', paid: '✅', defaulted: '🔴' };

  const lines = loans.map(l => {
    const remaining = l.totalOwed - l.amountPaid;
    const bankName = accountMap[l.lenderAccountId] || 'Unknown Bank';
    const pct = Math.round((l.amountPaid / l.totalOwed) * 100);
    const dueStr = l.status === 'active' ? ` · Due <t:${Math.floor(l.dueAt.getTime() / 1000)}:R>` : '';
    return (
      `${statusEmoji[l.status] || '❓'} **${l.type === 'property' ? 'Property' : 'Personal'} Loan** — ${bankName}\n` +
      `-# Principal: ${sym}${fmt(l.principal)} · Owed: ${sym}${fmt(remaining)} · ${pct}% paid${dueStr}`
    );
  });

  return interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(0x2d2d2d)
      .setTitle(`${target.username}'s Loans`)
      .setDescription(lines.join('\n\n'))
      .setFooter({ text: `${loans.length} loan${loans.length !== 1 ? 's' : ''} · RPM` })],
    flags: 64,
  });
}
