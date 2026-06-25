import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import AppyConfig from '../models/AppyConfig.js';
import AppyPanel from '../models/AppyPanel.js';
import AppySubmission from '../models/AppySubmission.js';

const _activeSessions = new Map();

function _clearSession(userId) {
  const session = _activeSessions.get(userId);
  if (session?.timeout) clearTimeout(session.timeout);
  _activeSessions.delete(userId);
}

export function hasActiveAppySession(userId) {
  return _activeSessions.has(userId);
}

export async function handleApplyButton(interaction, client) {
  const panelId = interaction.customId.replace('appy_apply_', '');

  if (_activeSessions.has(interaction.user.id)) {
    const embed = new EmbedBuilder()
      .setColor('#2d2d2d')
      .setDescription('You already have an active application in progress. Check your DMs.')
      .setFooter({ text: 'RPM' });
    return interaction.reply({ embeds: [embed], flags: 64 });
  }

  let panel, config;
  try {
    panel = await AppyPanel.findOne({ panelId });
    if (!panel) {
      const embed = new EmbedBuilder().setColor('#2d2d2d').setDescription('This application panel no longer exists.').setFooter({ text: 'RPM' });
      return interaction.reply({ embeds: [embed], flags: 64 });
    }
    config = await AppyConfig.findOne({ guildId: panel.guildId });
    if (!config?.enabled) {
      const embed = new EmbedBuilder().setColor('#2d2d2d').setDescription('Applications are currently disabled.').setFooter({ text: 'RPM' });
      return interaction.reply({ embeds: [embed], flags: 64 });
    }
  } catch (err) {
    console.error('[Appys] handleApplyButton DB error:', err.message);
    const embed = new EmbedBuilder().setColor('#2d2d2d').setDescription('An error occurred. Please try again later.').setFooter({ text: 'RPM' });
    return interaction.reply({ embeds: [embed], flags: 64 });
  }

  const existing = await AppySubmission.findOne({ guildId: panel.guildId, panelId, userId: interaction.user.id, status: 'pending' }).catch(() => null);
  if (existing) {
    const embed = new EmbedBuilder().setColor('#2d2d2d').setDescription('You already have a pending application for this panel.').setFooter({ text: 'RPM' });
    return interaction.reply({ embeds: [embed], flags: 64 });
  }

  if (!panel.questions || panel.questions.length === 0) {
    const embed = new EmbedBuilder().setColor('#2d2d2d').setDescription('This panel has no questions configured yet.').setFooter({ text: 'RPM' });
    return interaction.reply({ embeds: [embed], flags: 64 });
  }

  const firstEmbed = new EmbedBuilder()
    .setColor('#2d2d2d')
    .setTitle(panel.name)
    .setDescription(`### Application Started\n\n**Question 1 of ${panel.questions.length}**\n${panel.questions[0]}`)
    .setFooter({ text: 'RPM | Reply to this message with your answer. You have 10 minutes.' });

  try {
    await interaction.user.send({ embeds: [firstEmbed] });
  } catch {
    const embed = new EmbedBuilder()
      .setColor('#2d2d2d')
      .setDescription('I could not send you a DM. Enable direct messages from server members and try again.')
      .setFooter({ text: 'RPM' });
    return interaction.reply({ embeds: [embed], flags: 64 });
  }

  const timeout = setTimeout(async () => {
    _activeSessions.delete(interaction.user.id);
    const timeoutEmbed = new EmbedBuilder()
      .setColor('#2d2d2d')
      .setTitle('Application Timed Out')
      .setDescription(`Your application for **${panel.name}** was cancelled because you took too long to respond.`)
      .setFooter({ text: 'RPM' });
    interaction.user.send({ embeds: [timeoutEmbed] }).catch(() => {});
  }, 10 * 60 * 1000);

  _activeSessions.set(interaction.user.id, {
    panelId,
    guildId: panel.guildId,
    questionIndex: 0,
    answers: [],
    timeout,
  });

  const ackEmbed = new EmbedBuilder()
    .setColor('#2d2d2d')
    .setDescription('Check your DMs to complete your application.')
    .setFooter({ text: 'RPM' });
  await interaction.reply({ embeds: [ackEmbed], flags: 64 });
}

export async function handleDMReply(message, client) {
  const session = _activeSessions.get(message.author.id);
  if (!session) return;

  let panel;
  try {
    panel = await AppyPanel.findOne({ panelId: session.panelId });
    if (!panel) {
      _clearSession(message.author.id);
      return;
    }
  } catch {
    _clearSession(message.author.id);
    return;
  }

  session.answers.push({ question: panel.questions[session.questionIndex], answer: message.content });
  session.questionIndex++;

  if (session.questionIndex < panel.questions.length) {
    const nextEmbed = new EmbedBuilder()
      .setColor('#2d2d2d')
      .setTitle(panel.name)
      .setDescription(`**Question ${session.questionIndex + 1} of ${panel.questions.length}**\n${panel.questions[session.questionIndex]}`)
      .setFooter({ text: 'RPM | Reply with your answer.' });
    await message.author.send({ embeds: [nextEmbed] }).catch(() => {});
    return;
  }

  _clearSession(message.author.id);

  const { v4: uuidv4 } = await import('uuid');
  const submissionId = uuidv4();

  const submission = new AppySubmission({
    submissionId,
    guildId: session.guildId,
    panelId: session.panelId,
    userId: message.author.id,
    username: message.author.username,
    answers: session.answers,
    status: 'pending',
  });

  try {
    await submission.save();
  } catch (err) {
    console.error('[Appys] Failed to save submission:', err.message);
    return;
  }

  const confirmEmbed = new EmbedBuilder()
    .setColor('#2d2d2d')
    .setTitle('Application Submitted')
    .setDescription(`Your application for **${panel.name}** has been submitted. You will be notified of a decision.`)
    .setFooter({ text: 'RPM' });
  await message.author.send({ embeds: [confirmEmbed] }).catch(() => {});

  let config;
  try {
    config = await AppyConfig.findOne({ guildId: session.guildId });
    if (!config?.reviewChannelId) return;
  } catch { return; }

  const guild = client.guilds.cache.get(session.guildId);
  if (!guild) return;

  const reviewChannel = guild.channels.cache.get(config.reviewChannelId);
  if (!reviewChannel) return;

  const answersText = session.answers.map((a, i) =>
    `**Q${i + 1}: ${a.question}**\n${a.answer}`
  ).join('\n\n');

  const reviewEmbed = new EmbedBuilder()
    .setColor('#2d2d2d')
    .setTitle(`New Application - ${panel.name}`)
    .setDescription(`### Applicant\n<@${message.author.id}> (${message.author.username})\n\n### Responses\n${answersText}`)
    .setFooter({ text: 'RPM' });

  const acceptBtn = new ButtonBuilder()
    .setCustomId(`appy_accept_${submissionId}`)
    .setLabel('Accept')
    .setStyle(ButtonStyle.Success);
  const denyBtn = new ButtonBuilder()
    .setCustomId(`appy_deny_${submissionId}`)
    .setLabel('Deny')
    .setStyle(ButtonStyle.Danger);
  const row = new ActionRowBuilder().addComponents(acceptBtn, denyBtn);

  try {
    const reviewMsg = await reviewChannel.send({ embeds: [reviewEmbed], components: [row] });
    submission.reviewMessageId = reviewMsg.id;
    submission.reviewChannelId = config.reviewChannelId;
    await submission.save();
  } catch (err) {
    console.error('[Appys] Failed to post review message:', err.message);
  }
}

export async function handleAppyAccept(interaction, client) {
  const submissionId = interaction.customId.replace('appy_accept_', '');

  let submission;
  try {
    submission = await AppySubmission.findOne({ submissionId });
    if (!submission) return interaction.reply({ content: 'Submission not found.', flags: 64 });
    if (submission.status !== 'pending') return interaction.reply({ content: 'This application has already been reviewed.', flags: 64 });
  } catch (err) {
    return interaction.reply({ content: 'An error occurred.', flags: 64 });
  }

  submission.status = 'accepted';
  await submission.save();

  const panel = await AppyPanel.findOne({ panelId: submission.panelId }).catch(() => null);
  const guild = client.guilds.cache.get(submission.guildId);

  if (panel?.acceptRoleId && guild) {
    try {
      const member = await guild.members.fetch(submission.userId).catch(() => null);
      if (member) await member.roles.add(panel.acceptRoleId).catch(() => {});
    } catch {}
  }

  try {
    const user = await client.users.fetch(submission.userId).catch(() => null);
    if (user) {
      const acceptEmbed = new EmbedBuilder()
        .setColor('#2d2d2d')
        .setTitle('Application Accepted')
        .setDescription(`Your application for **${panel?.name || 'the panel'}** has been accepted.`)
        .setFooter({ text: 'RPM' });
      await user.send({ embeds: [acceptEmbed] }).catch(() => {});
    }
  } catch {}

  const oldDesc = interaction.message.embeds[0]?.description || '';
  const updatedEmbed = new EmbedBuilder()
    .setColor('#2d2d2d')
    .setTitle(interaction.message.embeds[0]?.title || '')
    .setDescription(oldDesc + `\n\n-# Accepted by ${interaction.user.username}`)
    .setFooter({ text: 'RPM' });

  await interaction.update({ embeds: [updatedEmbed], components: [] });
}

export async function handleAppyDeny(interaction, client) {
  const submissionId = interaction.customId.replace('appy_deny_', '');

  let submission;
  try {
    submission = await AppySubmission.findOne({ submissionId });
    if (!submission) return interaction.reply({ content: 'Submission not found.', flags: 64 });
    if (submission.status !== 'pending') return interaction.reply({ content: 'This application has already been reviewed.', flags: 64 });
  } catch {
    return interaction.reply({ content: 'An error occurred.', flags: 64 });
  }

  submission.status = 'denied';
  await submission.save();

  const panel = await AppyPanel.findOne({ panelId: submission.panelId }).catch(() => null);

  try {
    const user = await client.users.fetch(submission.userId).catch(() => null);
    if (user) {
      const denyEmbed = new EmbedBuilder()
        .setColor('#2d2d2d')
        .setTitle('Application Denied')
        .setDescription(`Your application for **${panel?.name || 'the panel'}** has been denied.`)
        .setFooter({ text: 'RPM' });
      await user.send({ embeds: [denyEmbed] }).catch(() => {});
    }
  } catch {}

  const oldDesc = interaction.message.embeds[0]?.description || '';
  const updatedEmbed = new EmbedBuilder()
    .setColor('#2d2d2d')
    .setTitle(interaction.message.embeds[0]?.title || '')
    .setDescription(oldDesc + `\n\n-# Denied by ${interaction.user.username}`)
    .setFooter({ text: 'RPM' });

  await interaction.update({ embeds: [updatedEmbed], components: [] });
}
