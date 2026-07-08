import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import BusinessLoanApplication from '../models/BusinessLoanApplication.js';
import BusinessAccount from '../models/BusinessAccount.js';
import Config from '../models/Config.js';

const errEmbed = msg => new EmbedBuilder().setColor(0xf04747).setDescription(`❌ ${msg}`).setFooter({ text: 'RPM' });
const fmt = n => Number(n).toLocaleString();

export const data = new SlashCommandBuilder()
  .setName('loanapplications')
  .setDescription('View pending loan applications for a business')
  .addStringOption(o => o.setName('business').setDescription('Business name').setRequired(true).setAutocomplete(true));

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
    if (!isStaff) return interaction.reply({ embeds: [errEmbed('You must be staff to view loan applications.')], flags: 64 });
  }

  const bizName = interaction.options.getString('business');
  const account = await BusinessAccount.findOne({
    guildId: interaction.guildId,
    name: new RegExp(`^${bizName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
  }).lean();
  if (!account) return interaction.reply({ embeds: [errEmbed(`No business named **${bizName}** found.`)], flags: 64 });

  const [applications, config] = await Promise.all([
    BusinessLoanApplication.find({
      guildId: interaction.guildId,
      lenderAccountId: account.accountId,
      status: 'pending',
    }).sort({ submittedAt: -1 }).limit(20).lean(),
    Config.findOne({ guildId: interaction.guildId }).lean(),
  ]);

  const sym = config?.currencySymbol || '$';

  if (!applications.length) {
    return interaction.reply({ embeds: [errEmbed(`No pending loan applications for **${account.name}**.`)], flags: 64 });
  }

  // Re-post each application as review embeds with Approve/Deny buttons
  const { buildLoanReviewEmbed } = await import('../handlers/loanHandler.js');
  await interaction.deferReply({ flags: 64 });

  for (const app of applications) {
    const { embed, components } = buildLoanReviewEmbed(app, sym);
    await interaction.followUp({ embeds: [embed], components, flags: 64 });
  }

  return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x2d2d2d).setDescription(`Showing ${applications.length} pending application${applications.length !== 1 ? 's' : ''}.`).setFooter({ text: 'RPM' })] });
}
