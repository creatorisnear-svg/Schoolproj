import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import AppyConfig from '../models/AppyConfig.js';
import AppyPanel from '../models/AppyPanel.js';
import AppySubmission from '../models/AppySubmission.js';
import AppyDraft from '../models/AppyDraft.js';
import Config from '../models/Config.js';

async function _postAppyLog(client, guildId, { action, applicantId, applicantUsername, panelName, staffUser }) {
  try {
    const cfg = await Config.findOne({ guildId });
    if (!cfg?.logChannelId) return;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;
    const logChannel = guild.channels.cache.get(cfg.logChannelId) ||
      await guild.channels.fetch(cfg.logChannelId).catch(() => null);
    if (!logChannel) return;
    const isAccept = action === 'accepted';
    const embed = new EmbedBuilder()
      .setColor('#2d2d2d')
      .setTitle(`Application ${isAccept ? 'Accepted' : 'Denied'}`)
      .setDescription(
        `### Applicant\n<@${applicantId}> (${applicantUsername})\n` +
        `### Application\n${panelName}\n` +
        `### Reviewed by\n<@${staffUser.id}> (${staffUser.username})`
      )
      .setFooter({ text: 'RPM' });
    await logChannel.send({ embeds: [embed] }).catch(() => {});
  } catch {}
}

const _activeSessions = new Map();

function _clearSession(userId) {
  const session = _activeSessions.get(userId);
  if (session?.timeout) clearTimeout(session.timeout);
  _activeSessions.delete(userId);
  AppyDraft.deleteOne({ userId }).catch(() => {});
}

export function hasActiveAppySession(userId) {
  return _activeSessions.has(userId);
}

/** Cancel an in-progress application session. Returns the panel name (or null). */
export async function cancelAppySession(userId) {
  const session = _activeSessions.get(userId);
  const panelName = session?.panelName || null;
  _clearSession(userId);
  return panelName;
}

function _saveDraft(userId, session) {
  AppyDraft.findOneAndUpdate(
    { userId },
    {
      userId,
      guildId: session.guildId,
      typeId: session.typeId,
      panelName: session.panelName,
      questionIndex: session.questionIndex,
      answers: session.answers,
      updatedAt: new Date(),
    },
    { upsert: true }
  ).catch(err => console.error('[Appys] Failed to save draft:', err.message));
}

// Restore in-progress applications from MongoDB on bot startup so that a
// restart (Koyeb redeploy, dev server bounce, etc.) mid-application doesn't
// silently drop the applicant's answers and orphan their session.
export async function restoreAppyDrafts(client) {
  let drafts;
  try {
    drafts = await AppyDraft.find({});
  } catch (err) {
    console.error('[Appys] Failed to restore drafts:', err.message);
    return;
  }

  for (const draft of drafts) {
    const userId = draft.userId;

    // Stale draft with no matching questions left (panel edited/deleted) - drop it.
    const panel = await AppyPanel.findOne({ typeId: draft.typeId }).catch(() => null);
    if (!panel || draft.questionIndex >= panel.questions.length) {
      await AppyDraft.deleteOne({ userId }).catch(() => {});
      continue;
    }

    const makeTimeout = (panelName) => setTimeout(async () => {
      _activeSessions.delete(userId);
      await AppyDraft.deleteOne({ userId }).catch(() => {});
      const timeoutEmbed = new EmbedBuilder()
        .setColor('#2d2d2d')
        .setTitle('Application Timed Out')
        .setDescription(`Your application for **${panelName}** was cancelled due to inactivity.\n-# You can restart the application at any time.`)
        .setFooter({ text: 'RPM' });
      client.users.fetch(userId).then(u => u.send({ embeds: [timeoutEmbed] }).catch(() => {})).catch(() => {});
    }, 30 * 60 * 1000);

    _activeSessions.set(userId, {
      typeId: draft.typeId,
      guildId: draft.guildId,
      questionIndex: draft.questionIndex,
      answers: draft.answers.map(a => ({ question: a.question, answer: a.answer })),
      panelName: draft.panelName,
      timeout: makeTimeout(draft.panelName),
      makeTimeout,
    });
  }

  if (drafts.length > 0) {
    console.log(`[Appys] Restored ${drafts.length} in-progress application session(s) from database.`);
  }
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
  if (existing) {
    const cancelBtn = new ButtonBuilder()
      .setCustomId(`appy_cancel_pending_${existing.submissionId}`)
      .setLabel('Cancel Current Application')
      .setStyle(ButtonStyle.Danger);
    const row = new ActionRowBuilder().addComponents(cancelBtn);
    const embed = new EmbedBuilder()
      .setColor('#2d2d2d')
      .setTitle('Pending Application')
      .setDescription(`You already have a pending application for **${panel.name}**.\n\n-# Cancel it to submit a new one. This cannot be undone.`)
      .setFooter({ text: 'RPM' });
    return interaction.reply({ embeds: [embed], components: [row], flags: 64 });
  }

  if (!panel.questions || panel.questions.length === 0) {
    return interaction.reply({ embeds: [_errEmbed('This application has no questions configured yet.')], flags: 64 });
  }

  const firstEmbed = new EmbedBuilder()
    .setColor('#2d2d2d')
    .setTitle(panel.name)
    .setDescription(`### Application Started\n\n**Question 1 of ${panel.questions.length}**\n${panel.questions[0]}`)
    .setFooter({ text: 'RPM | Just send your answer as a message below. You have 30 minutes per question.' });

  try {
    await interaction.user.send({ embeds: [firstEmbed] });
  } catch {
    return interaction.reply({ embeds: [_errEmbed('I could not send you a DM. Enable direct messages from server members and try again.')], flags: 64 });
  }

  const userId = interaction.user.id;
  const makeTimeout = (panelName) => setTimeout(async () => {
    _activeSessions.delete(userId);
    const timeoutEmbed = new EmbedBuilder()
      .setColor('#2d2d2d')
      .setTitle('Application Timed Out')
      .setDescription(`Your application for **${panelName}** was cancelled due to inactivity.\n-# You can restart the application at any time.`)
      .setFooter({ text: 'RPM' });
    interaction.user.send({ embeds: [timeoutEmbed] }).catch(() => {});
  }, 30 * 60 * 1000);

  const newSession = {
    typeId,
    guildId,
    questionIndex: 0,
    answers: [],
    panelName: panel.name,
    timeout: makeTimeout(panel.name),
    makeTimeout,
  };
  _activeSessions.set(userId, newSession);
  _saveDraft(userId, newSession);

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
    // Reset the 30-min timer for the next question
    clearTimeout(session.timeout);
    session.timeout = session.makeTimeout(session.panelName);
    _saveDraft(message.author.id, session);

    const nextEmbed = new EmbedBuilder()
      .setColor('#2d2d2d')
      .setTitle(panel.name)
      .setDescription(`**Question ${session.questionIndex + 1} of ${panel.questions.length}**\n${panel.questions[session.questionIndex]}`)
      .setFooter({ text: 'RPM | Just send your answer as a message below. You have 30 minutes per question.' });
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
  // Must fall back to fetch() - if the review channel wasn't already in the
  // client's cache (e.g. right after a bot restart), cache.get() silently
  // returns undefined and the whole submission would be dropped here with
  // no error, even though the applicant already got their "Submitted" DM.
  const reviewChannel = guild.channels.cache.get(config.reviewChannelId) ||
    await guild.channels.fetch(config.reviewChannelId).catch(() => null);
  if (!reviewChannel) {
    console.error(`[Appys] Review channel ${config.reviewChannelId} not found/fetchable for guild ${session.guildId} - submission ${submissionId} not posted for review`);
    return;
  }

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

export async function handleAppyCancelPending(interaction, client) {
  const submissionId = interaction.customId.replace('appy_cancel_pending_', '');
  let submission;
  try {
    submission = await AppySubmission.findOne({ submissionId });
  } catch {
    return interaction.update({ embeds: [_errEmbed('An error occurred.')], components: [] });
  }

  if (!submission) {
    return interaction.update({ embeds: [_errEmbed('Application not found — it may have already been reviewed or cancelled.')], components: [] });
  }
  if (submission.userId !== interaction.user.id) {
    return interaction.reply({ embeds: [_errEmbed('You cannot cancel someone else\'s application.')], flags: 64 });
  }
  if (submission.status !== 'pending') {
    return interaction.update({ embeds: [_errEmbed('This application has already been reviewed and cannot be cancelled.')], components: [] });
  }

  await AppySubmission.deleteOne({ submissionId }).catch(() => {});
  _clearSession(interaction.user.id);

  const embed = new EmbedBuilder()
    .setColor('#2d2d2d')
    .setTitle('Application Cancelled')
    .setDescription('Your pending application has been cancelled. You can now submit a new one.')
    .setFooter({ text: 'RPM' });
  await interaction.update({ embeds: [embed], components: [] });
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

  await _postAppyLog(client, submission.guildId, {
    action: 'accepted',
    applicantId: submission.userId,
    applicantUsername: submission.username,
    panelName: panel?.name || 'Unknown Application',
    staffUser: interaction.user,
  });
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

  await _postAppyLog(client, submission.guildId, {
    action: 'denied',
    applicantId: submission.userId,
    applicantUsername: submission.username,
    panelName: panel?.name || 'Unknown Application',
    staffUser: interaction.user,
  });
}
