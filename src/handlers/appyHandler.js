import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
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

function _errEmbed(msg) {
  return new EmbedBuilder().setColor('#2d2d2d').setDescription(msg).setFooter({ text: 'RPM' });
}

export async function handleAppyOpen(interaction, client) {
  const guildId = interaction.guildId;
  if (!guildId) return;

  let config, types;
  try {
    config = await AppyConfig.findOne({ guildId });
    if (!config?.enabled) return interaction.reply({ embeds: [_errEmbed('Applications are currently disabled.')], flags: 64 });
    types = await AppyPanel.find({ guildId }).sort({ createdAt: 1 });
    if (config.activeTypeIds && config.activeTypeIds.length > 0) {
      types = types.filter(t => config.activeTypeIds.includes(t.typeId));
    }
    if (!types || types.length === 0) return interaction.reply({ embeds: [_errEmbed('No application types are configured yet.')], flags: 64 });
  } catch (err) {
    console.error('[Appys] handleAppyOpen DB error:', err.message);
    return interaction.reply({ embeds: [_errEmbed('An error occurred. Please try again later.')], flags: 64 });
  }

  const options = types.map(t => ({
    label: t.name.slice(0, 100),
    description: (t.description || '').slice(0, 100) || undefined,
    value: t.typeId,
  }));

  const select = new StringSelectMenuBuilder()
    .setCustomId('appy_type_select')
    .setPlaceholder('Select an application...')
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(select);
  const embed = new EmbedBuilder()
    .setColor('#2d2d2d')
    .setTitle('Applications')
    .setDescription('Select the application you want to submit below.')
    .setFooter({ text: 'RPM' });

  await interaction.reply({ embeds: [embed], components: [row], flags: 64 });
}

export async function handleAppyTypeSelect(interaction, client) {
  const typeId = interaction.values[0];
  const guildId = interaction.guildId;

  if (_activeSessions.has(interaction.user.id)) {
    return interaction.reply({ embeds: [_errEmbed('You already have an active application in progress. Check your DMs.')], flags: 64 });
  }

  let panel, config;
  try {
    panel = await AppyPanel.findOne({ typeId, guildId });
    if (!panel) return interaction.reply({ embeds: [_errEmbed('This application type no longer exists.')], flags: 64 });
    config = await AppyConfig.findOne({ guildId });
    if (!config?.enabled) return interaction.reply({ embeds: [_errEmbed('Applications are currently disabled.')], flags: 64 });
  } catch (err) {
    console.error('[Appys] handleAppyTypeSelect DB error:', err.message);
    return interaction.reply({ embeds: [_errEmbed('An error occurred.')], flags: 64 });
  }

  const existing = await AppySubmission.findOne({ guildId, typeId, userId: interaction.user.id, status: 'pending' }).catch(() => null);
  if (existing) return interaction.reply({ embeds: [_errEmbed(`You already have a pending application for **${panel.name}**.`)], flags: 64 });

  if (!panel.questions || panel.questions.length === 0) {
    return interaction.reply({ embeds: [_errEmbed('This application has no questions configured yet.')], flags: 64 });
  }

  const firstEmbed = new EmbedBuilder()
    .setColor('#2d2d2d')
    .setTitle(panel.name)
    .setDescription(`### Application Started\n\n**Question 1 of ${panel.questions.length}**\n${panel.questions[0]}`)
    .setFooter({ text: 'RPM | Reply to this message with your answer. You have 10 minutes per question.' });

  try {
    await interaction.user.send({ embeds: [firstEmbed] });
  } catch {
    return interaction.reply({ embeds: [_errEmbed('I could not send you a DM. Enable direct messages from server members and try again.')], flags: 64 });
  }

  const timeout = setTimeout(async () => {
    _activeSessions.delete(interaction.user.id);
    const timeoutEmbed = new EmbedBuilder()
      .setColor('#2d2d2d')
      .setTitle('Application Timed Out')
      .setDescription(`Your application for **${panel.name}** was cancelled due to inactivity.`)
      .setFooter({ text: 'RPM' });
    interaction.user.send({ embeds: [timeoutEmbed] }).catch(() => {});
  }, 10 * 60 * 1000);

  _activeSessions.set(interaction.user.id, {
    typeId,
    guildId,
    questionIndex: 0,
    answers: [],
    timeout,
  });

  await interaction.reply({ embeds: [new EmbedBuilder().setColor('#2d2d2d').setDescription('Check your DMs to complete your application.').setFooter({ text: 'RPM' })], flags: 64 });
}

export async function handleDMReply(message, client) {
  const session = _activeSessions.get(message.author.id);
  if (!session) return;

  let panel;
  try {
    panel = await AppyPanel.findOne({ typeId: session.typeId });
    if (!panel) { _clearSession(message.author.id); return; }
  } catch { _clearSession(message.author.id); return; }

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
    typeId: session.typeId,
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

  const acceptBtn = new ButtonBuilder().setCustomId(`appy_accept_${submissionId}`).setLabel('Accept').setStyle(ButtonStyle.Success);
  const denyBtn = new ButtonBuilder().setCustomId(`appy_deny_${submissionId}`).setLabel('Deny').setStyle(ButtonStyle.Danger);
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
  } catch { return interaction.reply({ content: 'An error occurred.', flags: 64 }); }

  submission.status = 'accepted';
  await submission.save();

  const panel = await AppyPanel.findOne({ typeId: submission.typeId }).catch(() => null);
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
      const embed = new EmbedBuilder()
        .setColor('#2d2d2d')
        .setTitle('Application Accepted')
        .setDescription(`Your application for **${panel?.name || 'the position'}** has been accepted.`)
        .setFooter({ text: 'RPM' });
      await user.send({ embeds: [embed] }).catch(() => {});
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
  } catch { return interaction.reply({ content: 'An error occurred.', flags: 64 }); }

  submission.status = 'denied';
  await submission.save();

  const panel = await AppyPanel.findOne({ typeId: submission.typeId }).catch(() => null);

  try {
    const user = await client.users.fetch(submission.userId).catch(() => null);
    if (user) {
      const embed = new EmbedBuilder()
        .setColor('#2d2d2d')
        .setTitle('Application Denied')
        .setDescription(`Your application for **${panel?.name || 'the position'}** has been denied.`)
        .setFooter({ text: 'RPM' });
      await user.send({ embeds: [embed] }).catch(() => {});
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
