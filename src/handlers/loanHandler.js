import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { v4 as uuidv4 } from 'uuid';

import BusinessLoan            from '../models/BusinessLoan.js';
import BusinessLoanApplication from '../models/BusinessLoanApplication.js';
import BusinessLoanConfig      from '../models/BusinessLoanConfig.js';
import BusinessLoanDraft       from '../models/BusinessLoanDraft.js';
import BusinessAccount         from '../models/BusinessAccount.js';
import BusinessTransaction     from '../models/BusinessTransaction.js';
import EconomyBalance          from '../models/EconomyBalance.js';
import Config                  from '../models/Config.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const fmt      = n => Number(n).toLocaleString();
const errEmbed = msg => new EmbedBuilder().setColor(0xf04747).setDescription(`❌ ${msg}`).setFooter({ text: 'RPM' });
const okEmbed  = msg => new EmbedBuilder().setColor(0x2d2d2d).setDescription(msg).setFooter({ text: 'RPM' });

async function _getConfig(guildId) {
  return Config.findOne({ guildId }).lean();
}

async function _logTx(account, type, amount, user, note = null) {
  await BusinessTransaction.create({
    guildId:   account.guildId,
    accountId: account.accountId,
    type,
    userId:    user?.id   || null,
    username:  user?.username || null,
    amount,
    note,
  });
}

function _buildQuestions(loanType, max, sym) {
  const base = [
    `💰 **How much are you requesting?**\n-# Maximum: **${sym}${fmt(max)}** — reply with a number only`,
    `📅 **What repayment term would you like?**\n-# Enter a number of days between **1 and 7**`,
  ];
  if (loanType === 'personal') {
    return [...base, `📝 **What will you use this loan for?**`];
  }
  return [
    ...base,
    `🏠 **Describe the property you are financing.**`,
    `💎 **Do you have any collateral to offer?**\n-# Type \`none\` if you have none`,
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Session store
// ─────────────────────────────────────────────────────────────────────────────
const _activeLoanSessions = new Map();
// userId → { accountId, loanType, questions, questionIndex, answers,
//            requestedAmount, requestedTermDays, guildId,
//            personalMax, propertyMax, sym, timeout }

export function hasActiveLoanSession(userId) {
  return _activeLoanSessions.has(userId);
}

function _clearLoanSession(userId) {
  const session = _activeLoanSessions.get(userId);
  if (session?.timeout) clearTimeout(session.timeout);
  _activeLoanSessions.delete(userId);
  BusinessLoanDraft.deleteOne({ userId }).catch(() => {});
}

async function _saveLoanDraft(userId, session) {
  await BusinessLoanDraft.findOneAndUpdate(
    { userId },
    {
      userId,
      guildId:       session.guildId,
      accountId:     session.accountId,
      loanType:      session.loanType,
      questionIndex: session.questionIndex,
      answers:       session.answers,
      updatedAt:     new Date(),
    },
    { upsert: true, new: true },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel Apply button  →  loan_apply_{accountId}
// ─────────────────────────────────────────────────────────────────────────────
export async function handleLoanApply(interaction) {
  const accountId = interaction.customId.replace('loan_apply_', '');
  const [account, loanConfig] = await Promise.all([
    BusinessAccount.findOne({ accountId, guildId: interaction.guildId }).lean(),
    BusinessLoanConfig.findOne({ accountId, guildId: interaction.guildId }).lean(),
  ]);

  if (!account || !loanConfig) {
    return interaction.reply({ embeds: [errEmbed('This loan service is not currently configured.')], flags: 64 });
  }

  if (_activeLoanSessions.has(interaction.user.id)) {
    return interaction.reply({
      embeds: [errEmbed('You already have a loan application in progress. Check your DMs, or type **cancel** to start over.')],
      flags: 64,
    });
  }

  const existing = await BusinessLoanApplication.findOne({
    guildId:         interaction.guildId,
    lenderAccountId: accountId,
    applicantUserId: interaction.user.id,
    status:          'pending',
  }).lean();
  if (existing) {
    return interaction.reply({
      embeds: [errEmbed(`You already have a pending application with **${account.name}**. Please wait for a decision.`)],
      flags: 64,
    });
  }

  const options = [];
  if (loanConfig.personalLoansEnabled) {
    options.push({ label: 'Personal Loan', value: `personal_${accountId}`, description: `Up to $${fmt(loanConfig.personalLoanMax)} · max 7 days` });
  }
  if (loanConfig.propertyLoansEnabled) {
    options.push({ label: 'Property Loan', value: `property_${accountId}`, description: `Up to $${fmt(loanConfig.propertyLoanMax)} · max 7 days` });
  }

  if (!options.length) {
    return interaction.reply({ embeds: [errEmbed(`**${account.name}** is not currently accepting loan applications.`)], flags: 64 });
  }

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`loan_type_select_${accountId}`)
      .setPlaceholder('Select loan type...')
      .addOptions(options),
  );

  return interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(0x2d2d2d)
      .setTitle(`${account.name} — Loan Application`)
      .setDescription('Select the type of loan you would like to apply for.\n-# A short Q&A will be sent to your DMs.')
      .setFooter({ text: 'RPM' })],
    components: [row],
    flags: 64,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Type select  →  loan_type_select_{accountId}
// ─────────────────────────────────────────────────────────────────────────────
export async function handleLoanTypeSelect(interaction) {
  // Ack immediately — DB lookups + a DM send below can easily exceed Discord's
  // 3s interaction ack window, which otherwise shows "This interaction failed".
  await interaction.deferUpdate();

  const accountId = interaction.customId.replace('loan_type_select_', '');
  const selected  = interaction.values[0]; // "personal_{accountId}" or "property_{accountId}"
  const loanType  = selected.startsWith('personal') ? 'personal' : 'property';

  const [account, loanConfig, guildConfig] = await Promise.all([
    BusinessAccount.findOne({ accountId, guildId: interaction.guildId }).lean(),
    BusinessLoanConfig.findOne({ accountId, guildId: interaction.guildId }).lean(),
    _getConfig(interaction.guildId),
  ]);

  if (!account || !loanConfig) {
    return interaction.editReply({ embeds: [errEmbed('Loan service not found.')], components: [] });
  }

  const sym  = guildConfig?.currencySymbol || '$';
  const personalMax = loanConfig.personalLoanMax ?? 100000;
  const propertyMax = loanConfig.propertyLoanMax ?? 500000;
  const max  = loanType === 'personal' ? personalMax : propertyMax;
  const questions = _buildQuestions(loanType, max, sym);

  // Try DM
  try {
    await interaction.user.send({
      embeds: [new EmbedBuilder()
        .setColor(0x2d2d2d)
        .setTitle(`${account.name} — ${loanType === 'personal' ? 'Personal' : 'Property'} Loan Application`)
        .setDescription(questions[0])
        .setFooter({ text: `Question 1 of ${questions.length} · Type "cancel" to cancel` })],
    });
  } catch {
    return interaction.editReply({ embeds: [errEmbed('I could not send you a DM. Please enable DMs from server members and try again.')], components: [] });
  }

  const session = {
    accountId,
    loanType,
    questions,
    questionIndex: 0,
    answers:          [],
    requestedAmount:  null,
    requestedTermDays: null,
    guildId:          interaction.guildId,
    personalMax,
    propertyMax,
    sym,
    timeout:          null,
  };

  session.timeout = setTimeout(async () => {
    _activeLoanSessions.delete(interaction.user.id);
    BusinessLoanDraft.deleteOne({ userId: interaction.user.id }).catch(() => {});
    try { await interaction.user.send({ embeds: [errEmbed('Your loan application timed out due to inactivity.')] }); } catch { /* DMs closed */ }
  }, 30 * 60 * 1000);

  _activeLoanSessions.set(interaction.user.id, session);
  await _saveLoanDraft(interaction.user.id, session);

  return interaction.editReply({
    embeds: [okEmbed('✅ Application started! Check your DMs to continue.')],
    components: [],
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// DM reply handler  —  returns true if message was consumed
// ─────────────────────────────────────────────────────────────────────────────
export async function handleLoanDMReply(message, client) {
  const session = _activeLoanSessions.get(message.author.id);
  if (!session) return false;

  const text = message.content.trim();

  // Cancel keyword
  if (text.toLowerCase() === 'cancel') {
    _clearLoanSession(message.author.id);
    await message.author.send({ embeds: [okEmbed('Your loan application has been cancelled.')] });
    return true;
  }

  const { questionIndex, questions, sym } = session;
  const max = session.loanType === 'personal' ? session.personalMax : session.propertyMax;

  // Q0 — amount
  if (questionIndex === 0) {
    const num = parseFloat(text.replace(/[,$]/g, ''));
    if (isNaN(num) || num < 1) {
      await message.author.send({ embeds: [errEmbed('Please enter a valid number, e.g. `5000`.')] });
      return true;
    }
    if (num > max) {
      await message.author.send({ embeds: [errEmbed(`The maximum for this loan type is **${sym}${fmt(max)}**. Please enter a lower amount.`)] });
      return true;
    }
    session.requestedAmount = Math.floor(num);
    session.answers.push({ question: questions[0], answer: String(Math.floor(num)) });
  }
  // Q1 — term days
  else if (questionIndex === 1) {
    const days = parseInt(text);
    if (isNaN(days) || days < 1 || days > 7) {
      await message.author.send({ embeds: [errEmbed('Please enter a number between **1 and 7** (days).')] });
      return true;
    }
    session.requestedTermDays = days;
    session.answers.push({ question: questions[1], answer: `${days} days` });
  }
  // All other questions — free text
  else {
    session.answers.push({ question: questions[questionIndex], answer: text });
  }

  session.questionIndex++;

  // Reset inactivity timeout
  clearTimeout(session.timeout);
  session.timeout = setTimeout(async () => {
    _activeLoanSessions.delete(message.author.id);
    BusinessLoanDraft.deleteOne({ userId: message.author.id }).catch(() => {});
    try { await message.author.send({ embeds: [errEmbed('Your loan application timed out due to inactivity.')] }); } catch { /* DMs closed */ }
  }, 30 * 60 * 1000);

  await _saveLoanDraft(message.author.id, session);

  // All questions answered → submit
  if (session.questionIndex >= questions.length) {
    await _submitLoanApplication(message, client, session);
    return true;
  }

  // Send next question
  await message.author.send({
    embeds: [new EmbedBuilder()
      .setColor(0x2d2d2d)
      .setDescription(questions[session.questionIndex])
      .setFooter({ text: `Question ${session.questionIndex + 1} of ${questions.length} · Type "cancel" to cancel` })],
  });

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Submit application  —  internal
// ─────────────────────────────────────────────────────────────────────────────
async function _submitLoanApplication(message, client, session) {
  const { accountId, loanType, answers, requestedAmount, requestedTermDays, guildId } = session;

  const [account, loanConfig, guildConfig] = await Promise.all([
    BusinessAccount.findOne({ accountId }).lean(),
    BusinessLoanConfig.findOne({ accountId, guildId }).lean(),
    _getConfig(guildId),
  ]);

  const sym = guildConfig?.currencySymbol || '$';
  const applicationId = uuidv4();

  const application = await BusinessLoanApplication.create({
    applicationId,
    guildId,
    lenderAccountId:   accountId,
    applicantUserId:   message.author.id,
    applicantUsername: message.author.username,
    type:              loanType,
    requestedAmount,
    requestedTermDays,
    answers,
    status:            'pending',
    reviewChannelId:   loanConfig?.reviewChannelId || null,
  });

  _clearLoanSession(message.author.id);

  // DM applicant confirmation
  await message.author.send({
    embeds: [new EmbedBuilder()
      .setColor(0x2d2d2d)
      .setTitle('Application Submitted')
      .setDescription(
        `Your **${loanType} loan** application for **${sym}${fmt(requestedAmount)}** has been submitted to **${account?.name || 'the bank'}**.\n` +
        `You will be notified when a decision is made.`,
      )
      .setFooter({ text: 'RPM' })],
  }).catch(() => {});

  // Post to review channel
  if (!loanConfig?.reviewChannelId) return;

  try {
    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;
    const ch = guild.channels.cache.get(loanConfig.reviewChannelId)
      || await guild.channels.fetch(loanConfig.reviewChannelId).catch(() => null);
    if (!ch?.isTextBased()) return;

    const { embed, components } = buildLoanReviewEmbed(application, sym);

    const pingContent = loanConfig.reviewPingRoleIds?.length
      ? loanConfig.reviewPingRoleIds.map(r => `<@&${r}>`).join(' ')
      : '';

    const msg = await ch.send({ content: pingContent || undefined, embeds: [embed], components });

    application.reviewMessageId = msg.id;
    await application.save();
  } catch (err) {
    console.error('[LoanHandler] Review channel post error:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Build review embed  —  exported for /loanapplications command
// ─────────────────────────────────────────────────────────────────────────────
export function buildLoanReviewEmbed(application, sym = '$') {
  const fmt2 = n => Number(n).toLocaleString();
  const qaLines = application.answers.map(a => `**${a.question.replace(/\n-#.*$/s, '')}**\n${a.answer}`).join('\n\n');

  const embed = new EmbedBuilder()
    .setColor(0x2d2d2d)
    .setTitle(`Loan Application — ${application.type === 'property' ? 'Property' : 'Personal'}`)
    .setDescription(
      `**Applicant:** <@${application.applicantUserId}> (${application.applicantUsername})\n` +
      `**Amount:** ${sym}${fmt2(application.requestedAmount)}\n` +
      `**Term:** ${application.requestedTermDays} day${application.requestedTermDays !== 1 ? 's' : ''}\n\n` +
      `${qaLines}`,
    )
    .setFooter({ text: `Application ID: ${application.applicationId.slice(0, 8)} · RPM` })
    .setTimestamp(application.submittedAt);

  const components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`loan_approve_${application.applicationId}`)
        .setLabel('Approve')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅'),
      new ButtonBuilder()
        .setCustomId(`loan_deny_${application.applicationId}`)
        .setLabel('Deny')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌'),
    ),
  ];

  return { embed, components };
}

// ─────────────────────────────────────────────────────────────────────────────
// Approve button  →  loan_approve_{applicationId}
// ─────────────────────────────────────────────────────────────────────────────
export async function handleLoanApprove(interaction) {
  const applicationId = interaction.customId.replace('loan_approve_', '');
  const application = await BusinessLoanApplication.findOne({ applicationId }).lean();
  if (!application) return interaction.reply({ embeds: [errEmbed('Application not found.')], flags: 64 });
  if (application.status !== 'pending') {
    return interaction.reply({ embeds: [errEmbed(`This application has already been **${application.status}**.`)], flags: 64 });
  }

  const loanConfig = await BusinessLoanConfig.findOne({ accountId: application.lenderAccountId, guildId: application.guildId }).lean();
  const canReview = interaction.member?.permissions?.has('Administrator')
    || loanConfig?.reviewPingRoleIds?.some(r => interaction.member?.roles?.cache?.has(r));
  if (!canReview) {
    const { checkStaffPermission } = await import('../utils/permissions.js');
    const isStaff = await checkStaffPermission(interaction.guildId, interaction.member);
    if (!isStaff) return interaction.reply({ embeds: [errEmbed('You do not have permission to review loan applications.')], flags: 64 });
  }

  const defaultRate = loanConfig?.defaultInterestRate ?? 10;

  const modal = new ModalBuilder()
    .setCustomId(`loan_approve_modal_${applicationId}`)
    .setTitle('Approve Loan')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('interest_rate')
          .setLabel('Annual interest rate % (e.g. 10 for 10%)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(String(defaultRate))
          .setPlaceholder('e.g. 10'),
      ),
    );

  return interaction.showModal(modal);
}

// ─────────────────────────────────────────────────────────────────────────────
// Approve modal submit  →  loan_approve_modal_{applicationId}
// ─────────────────────────────────────────────────────────────────────────────
export async function handleLoanApproveModal(interaction) {
  const applicationId = interaction.customId.replace('loan_approve_modal_', '');
  const rateRaw = interaction.fields.getTextInputValue('interest_rate');
  const rate    = parseFloat(rateRaw);

  if (isNaN(rate) || rate < 0 || rate > 1000) {
    return interaction.reply({ embeds: [errEmbed('Invalid interest rate. Enter a percentage like `10` for 10%.')], flags: 64 });
  }

  const application = await BusinessLoanApplication.findOne({ applicationId });
  if (!application || application.status !== 'pending') {
    return interaction.reply({ embeds: [errEmbed('Application not found or already reviewed.')], flags: 64 });
  }

  const [guildConfig, account] = await Promise.all([
    _getConfig(interaction.guildId),
    BusinessAccount.findOne({ accountId: application.lenderAccountId, guildId: interaction.guildId }),
  ]);
  const sym = guildConfig?.currencySymbol || '$';

  if (!account) return interaction.reply({ embeds: [errEmbed('Business account not found.')], flags: 64 });
  if (account.balance < application.requestedAmount) {
    return interaction.reply({ embeds: [errEmbed(
      `**${account.name}** only has ${sym}${fmt(account.balance)} and cannot cover this loan of ${sym}${fmt(application.requestedAmount)}.`,
    )], flags: 64 });
  }

  // Simple interest: total = principal × (1 + rate/100 × days/365)
  const totalOwed = Math.round(application.requestedAmount * (1 + (rate / 100) * (application.requestedTermDays / 365)));
  const issuedAt  = new Date();
  const dueAt     = new Date(issuedAt.getTime() + application.requestedTermDays * 24 * 60 * 60 * 1000);
  const loanId    = uuidv4();

  await BusinessLoan.create({
    loanId,
    guildId:         interaction.guildId,
    lenderAccountId: application.lenderAccountId,
    borrowerUserId:  application.applicantUserId,
    type:            application.type,
    principal:       application.requestedAmount,
    interestRate:    rate,
    termDays:        application.requestedTermDays,
    totalOwed,
    amountPaid:      0,
    status:          'active',
    issuedAt,
    dueAt,
    reminderSent:    false,
  });

  account.balance -= application.requestedAmount;
  await account.save();
  await _logTx(account, 'loan_out', application.requestedAmount, interaction.user, `Loan to ${application.applicantUsername}`);

  await EconomyBalance.findOneAndUpdate(
    { guildId: interaction.guildId, userId: application.applicantUserId },
    { $inc: { cash: application.requestedAmount } },
    { upsert: true },
  );

  application.status     = 'approved';
  application.reviewedBy = interaction.user.id;
  application.interestRate = rate;
  await application.save();

  // Update review message — remove buttons, stamp approved
  if (application.reviewMessageId && application.reviewChannelId) {
    try {
      const ch = interaction.guild.channels.cache.get(application.reviewChannelId)
        || await interaction.guild.channels.fetch(application.reviewChannelId).catch(() => null);
      const msg = ch ? await ch.messages.fetch(application.reviewMessageId).catch(() => null) : null;
      if (msg) {
        await msg.edit({
          embeds: [new EmbedBuilder()
            .setColor(0x43b581)
            .setTitle(`✅ Approved — ${application.type === 'property' ? 'Property' : 'Personal'} Loan`)
            .setDescription(
              `**Applicant:** <@${application.applicantUserId}>\n` +
              `**Principal:** ${sym}${fmt(application.requestedAmount)}\n` +
              `**Total Owed:** ${sym}${fmt(totalOwed)} (${rate}% annual)\n` +
              `**Due:** <t:${Math.floor(dueAt.getTime() / 1000)}:f>\n` +
              `**Approved by:** ${interaction.user.username}`,
            )
            .setFooter({ text: 'RPM' })],
          components: [],
        });
      }
    } catch { /* non-fatal */ }
  }

  // DM borrower
  try {
    const borrower = await interaction.client.users.fetch(application.applicantUserId);
    await borrower.send({
      embeds: [new EmbedBuilder()
        .setColor(0x43b581)
        .setTitle('🎉 Loan Approved!')
        .setDescription(
          `Your **${application.type} loan** from **${account.name}** has been approved!\n\n` +
          `**Amount received:** ${sym}${fmt(application.requestedAmount)}\n` +
          `**Total owed:** ${sym}${fmt(totalOwed)} (${rate}% annual interest)\n` +
          `**Due:** <t:${Math.floor(dueAt.getTime() / 1000)}:f>\n\n` +
          `Use \`/loanpay\` to make payments before the due date.`,
        )
        .setFooter({ text: 'RPM' })],
    });
  } catch { /* DMs closed */ }

  return interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(0x43b581)
      .setDescription(
        `✅ Loan approved. **${sym}${fmt(application.requestedAmount)}** transferred from **${account.name}** to **${application.applicantUsername}**.`,
      )
      .setFooter({ text: 'RPM' })],
    flags: 64,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Deny button  →  loan_deny_{applicationId}
// ─────────────────────────────────────────────────────────────────────────────
export async function handleLoanDeny(interaction) {
  const applicationId = interaction.customId.replace('loan_deny_', '');
  const application = await BusinessLoanApplication.findOne({ applicationId }).lean();
  if (!application) return interaction.reply({ embeds: [errEmbed('Application not found.')], flags: 64 });
  if (application.status !== 'pending') {
    return interaction.reply({ embeds: [errEmbed(`This application has already been **${application.status}**.`)], flags: 64 });
  }

  const loanConfig = await BusinessLoanConfig.findOne({ accountId: application.lenderAccountId, guildId: application.guildId }).lean();
  const canReview = interaction.member?.permissions?.has('Administrator')
    || loanConfig?.reviewPingRoleIds?.some(r => interaction.member?.roles?.cache?.has(r));
  if (!canReview) {
    const { checkStaffPermission } = await import('../utils/permissions.js');
    const isStaff = await checkStaffPermission(interaction.guildId, interaction.member);
    if (!isStaff) return interaction.reply({ embeds: [errEmbed('You do not have permission to review loan applications.')], flags: 64 });
  }

  const modal = new ModalBuilder()
    .setCustomId(`loan_deny_modal_${applicationId}`)
    .setTitle('Deny Loan Application')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Reason (shown to applicant)')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setPlaceholder('Optional — leave blank to send a generic denial'),
      ),
    );

  return interaction.showModal(modal);
}

// ─────────────────────────────────────────────────────────────────────────────
// Deny modal submit  →  loan_deny_modal_{applicationId}
// ─────────────────────────────────────────────────────────────────────────────
export async function handleLoanDenyModal(interaction) {
  const applicationId = interaction.customId.replace('loan_deny_modal_', '');
  const reason = interaction.fields.getTextInputValue('reason').trim() || null;

  const application = await BusinessLoanApplication.findOne({ applicationId });
  if (!application || application.status !== 'pending') {
    return interaction.reply({ embeds: [errEmbed('Application not found or already reviewed.')], flags: 64 });
  }

  const account = await BusinessAccount.findOne({ accountId: application.lenderAccountId }).lean();

  application.status     = 'denied';
  application.reviewedBy = interaction.user.id;
  await application.save();

  // Update review message
  if (application.reviewMessageId && application.reviewChannelId) {
    try {
      const ch = interaction.guild.channels.cache.get(application.reviewChannelId)
        || await interaction.guild.channels.fetch(application.reviewChannelId).catch(() => null);
      const msg = ch ? await ch.messages.fetch(application.reviewMessageId).catch(() => null) : null;
      if (msg) {
        await msg.edit({
          embeds: [new EmbedBuilder()
            .setColor(0xf04747)
            .setTitle(`❌ Denied — ${application.type === 'property' ? 'Property' : 'Personal'} Loan`)
            .setDescription(
              `**Applicant:** <@${application.applicantUserId}>\n` +
              `**Amount Requested:** $${fmt(application.requestedAmount)}\n` +
              (reason ? `**Reason:** ${reason}\n` : '') +
              `**Denied by:** ${interaction.user.username}`,
            )
            .setFooter({ text: 'RPM' })],
          components: [],
        });
      }
    } catch { /* non-fatal */ }
  }

  // DM applicant
  try {
    const borrower = await interaction.client.users.fetch(application.applicantUserId);
    await borrower.send({
      embeds: [new EmbedBuilder()
        .setColor(0xf04747)
        .setTitle('Loan Application Denied')
        .setDescription(
          `Your **${application.type} loan** application with **${account?.name || 'the bank'}** has been denied.\n` +
          (reason ? `\n**Reason:** ${reason}` : ''),
        )
        .setFooter({ text: 'RPM' })],
    });
  } catch { /* DMs closed */ }

  return interaction.reply({
    embeds: [okEmbed(`❌ Application from **${application.applicantUsername}** denied.`)],
    flags: 64,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Cancel session button  →  loan_cancel_session
// ─────────────────────────────────────────────────────────────────────────────
export async function handleLoanCancelSession(interaction) {
  _clearLoanSession(interaction.user.id);
  return interaction.reply({ embeds: [okEmbed('Your loan application session has been cancelled.')], flags: 64 });
}

// ─────────────────────────────────────────────────────────────────────────────
// Hourly loan reminder cron
// ─────────────────────────────────────────────────────────────────────────────
export async function checkLoanReminders(client) {
  if (!client.isReady()) return;
  const now   = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const loans = await BusinessLoan.find({
    status:       'active',
    reminderSent: false,
    dueAt:        { $lte: in24h },
  }).lean();

  for (const loan of loans) {
    const [account, guildConfig] = await Promise.all([
      BusinessAccount.findOne({ accountId: loan.lenderAccountId }).lean(),
      _getConfig(loan.guildId),
    ]);
    const sym       = guildConfig?.currencySymbol || '$';
    const remaining = loan.totalOwed - loan.amountPaid;

    try {
      const user = await client.users.fetch(loan.borrowerUserId);
      await user.send({
        embeds: [new EmbedBuilder()
          .setColor(0xFF9900)
          .setTitle('⏰ Loan Payment Due Soon')
          .setDescription(
            `Your **${loan.type === 'property' ? 'Property' : 'Personal'} Loan** from **${account?.name || 'your lender'}** is due <t:${Math.floor(loan.dueAt.getTime() / 1000)}:R>.\n\n` +
            `**Still owed:** ${sym}${fmt(remaining)}\n` +
            `Use \`/loanpay\` to make a payment before it is marked defaulted.`,
          )
          .setFooter({ text: 'RPM' })],
      });
      await BusinessLoan.updateOne({ loanId: loan.loanId }, { reminderSent: true });
    } catch { /* DMs closed — non-fatal */ }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Restore loan drafts on startup
// ─────────────────────────────────────────────────────────────────────────────
export async function restoreLoanDrafts(client) {
  const drafts = await BusinessLoanDraft.find({}).lean();
  for (const draft of drafts) {
    if (_activeLoanSessions.has(draft.userId)) continue;

    const [account, loanConfig, guildConfig] = await Promise.all([
      BusinessAccount.findOne({ accountId: draft.accountId }).lean(),
      BusinessLoanConfig.findOne({ accountId: draft.accountId, guildId: draft.guildId }).lean(),
      _getConfig(draft.guildId),
    ]);
    if (!account) continue;

    const sym         = guildConfig?.currencySymbol || '$';
    const personalMax = loanConfig?.personalLoanMax ?? 100000;
    const propertyMax = loanConfig?.propertyLoanMax ?? 500000;
    const max         = draft.loanType === 'personal' ? personalMax : propertyMax;
    const questions   = _buildQuestions(draft.loanType, max, sym);

    const session = {
      accountId:         draft.accountId,
      loanType:          draft.loanType,
      questions,
      questionIndex:     draft.questionIndex,
      answers:           draft.answers || [],
      requestedAmount:   draft.answers?.[0]?.answer ? parseInt(draft.answers[0].answer) : null,
      requestedTermDays: draft.answers?.[1]?.answer ? parseInt(draft.answers[1].answer) : null,
      guildId:           draft.guildId,
      personalMax,
      propertyMax,
      sym,
      timeout:           null,
    };

    session.timeout = setTimeout(() => {
      _activeLoanSessions.delete(draft.userId);
      BusinessLoanDraft.deleteOne({ userId: draft.userId }).catch(() => {});
    }, 30 * 60 * 1000);

    _activeLoanSessions.set(draft.userId, session);
  }

  if (drafts.length > 0) {
    console.log(`[LoanHandler] Restored ${drafts.length} loan draft session(s)`);
  }
}
