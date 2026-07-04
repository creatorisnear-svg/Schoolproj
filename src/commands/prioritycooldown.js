import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import Priority from '../models/Priority.js';
import DispatchConfig from '../models/DispatchConfig.js';
import { successEmbed, errorEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';
import { checkFeatureAccess, buildPremiumEmbed } from '../utils/premiumCheck.js';

async function announceCooldownTTS(guildId, text) {
  try {
    const cfg = await DispatchConfig.findOne({ guildId });
    // Match join-audio behavior: only require dispatch to be enabled/configured,
    // not the conversational AI toggle - this is a static announcement, not an
    // AI-generated response, so it should still play even with aiEnabled off.
    if (!cfg?.enabled || !cfg?.patrolChannelIds?.length) {
      console.log(`[PriorityCooldown] Skipping TTS - dispatch not enabled/configured for guild ${guildId}`);
      return;
    }
    const { generateDispatchTTSPublic } = await import('../handlers/dispatchHandler.js');
    const { playDispatchVoice } = await import('../utils/voiceListener.js');
    const buf = await generateDispatchTTSPublic(text);
    if (!buf) {
      console.warn(`[PriorityCooldown] TTS generation returned no buffer for guild ${guildId}`);
      return;
    }
    playDispatchVoice(guildId, buf);
    console.log(`[PriorityCooldown] Announced TTS for guild ${guildId}`);
  } catch (e) {
    console.error('[PriorityCooldown] TTS error:', e.message);
  }
}

export const data = new SlashCommandBuilder()
  .setName('prioritycooldown')
  .setDescription('Set priority cooldown duration in minutes (Admin/Staff)')
  .addIntegerOption(option =>
    option
      .setName('minutes')
      .setDescription('Cooldown duration in minutes')
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(1440)
  );

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command.')],
      flags: 64,
    });
  }

  const access = await checkFeatureAccess(interaction.guildId, 'priority');
  if (!access) return interaction.reply({ embeds: [buildPremiumEmbed('priority')], flags: 64 });

  try {
    const minutes = interaction.options.getInteger('minutes');
    const priority = await Priority.findOne({ guildId: interaction.guildId });

    if (!priority || !priority.enabled) {
      return interaction.reply({
        embeds: [errorEmbed('Priority tracker is not enabled or configured on this server.')],
        flags: 64,
      });
    }

    if (!priority.channelId) {
      return interaction.reply({
        embeds: [errorEmbed('Priority tracker channel is not configured. Use `/prioritytrackerconfig` to configure it.')],
        flags: 64,
      });
    }

    const now = new Date();
    const endsAt = new Date(now.getTime() + minutes * 60000);

    priority.cooldownMinutes = minutes;
    priority.cooldownEndsAt = endsAt;
    priority.cooldownIssuedBy = interaction.user.tag;
    await priority.save();

    await updatePriorityMessage(interaction.guild, priority);

    scheduleCooldownExpiry(interaction.client, priority);

    const minuteWord = minutes === 1 ? 'minute' : 'minutes';
    announceCooldownTTS(
      interaction.guildId,
      `Attention all units, priority cooldown has been activated for ${minutes} ${minuteWord}. Priority events are restricted during this time.`
    );

    return interaction.reply({
      embeds: [successEmbed('Cooldown Set', `Priority cooldown set to **${minutes}m**`)],
      flags: 64,
    });
  } catch (error) {
    console.error('Error setting priority cooldown:', error);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while setting priority cooldown.')],
      flags: 64,
    });
  }
}

export function scheduleCooldownExpiry(client, priority) {
  if (!priority.cooldownEndsAt || !priority.channelId || !priority.messageId) return;

  const expiresAt = new Date(priority.cooldownEndsAt).getTime();
  const delay = Math.max(0, expiresAt - Date.now());
  const guildId = priority.guildId;

  async function expireCooldown() {
    try {
      const record = await Priority.findOne({ guildId });
      if (!record || !record.cooldownEndsAt) return;
      if (new Date(record.cooldownEndsAt).getTime() > Date.now() + 5000) return;

      record.cooldownEndsAt = null;
      record.cooldownIssuedBy = null;
      record.cooldownMinutes = 0;
      await record.save();

      const guild = client.guilds.cache.get(guildId);
      if (!guild) return;
      const channel = await guild.channels.fetch(record.channelId).catch(() => null);
      if (!channel || !channel.isTextBased()) return;
      const message = await channel.messages.fetch(record.messageId).catch(() => null);
      if (!message) return;

      const embed = buildPriorityEmbed(record);
      const components = (record.priorityActive && record.hostUserId)
        ? [new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('priority_stop')
              .setLabel('Stop Priority')
              .setStyle(ButtonStyle.Danger)
              
          )]
        : [];
      await message.edit({ embeds: [embed], components });

      announceCooldownTTS(
        guildId,
        `Attention all units, the priority cooldown has ended. Priority events may now be activated.`
      );
    } catch (err) {
      console.error('Error auto-expiring cooldown:', err);
    }
  }

  if (delay === 0) {
    expireCooldown();
  } else {
    setTimeout(expireCooldown, delay);
  }
}

async function updatePriorityMessage(guild, priority) {
  try {
    const channel = await guild.channels.fetch(priority.channelId);
    if (!channel) return;

    const embed = buildPriorityEmbed(priority);
    const components = (priority.priorityActive && priority.hostUserId)
      ? [new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('priority_stop')
            .setLabel('Stop Priority')
            .setStyle(ButtonStyle.Danger)
            
        )]
      : [];

    if (priority.messageId) {
      try {
        const message = await channel.messages.fetch(priority.messageId);
        await message.edit({ embeds: [embed], components });
      } catch (err) {
        const message = await channel.send({ embeds: [embed] });
        priority.messageId = message.id;
        await priority.save();
      }
    } else {
      const message = await channel.send({ embeds: [embed] });
      priority.messageId = message.id;
      await priority.save();
    }
  } catch (error) {
    console.error('Error updating priority message:', error);
  }
}

function buildPriorityEmbed(priority) {
  let cooldownText = 'None';
  let cooldownIssuedBy = 'N/A';

  if (priority.cooldownEndsAt) {
    const remaining = Math.floor((new Date(priority.cooldownEndsAt) - Date.now()) / 1000 / 60);
    if (remaining > 0) {
      cooldownText = `${remaining}m remaining`;
      cooldownIssuedBy = priority.cooldownIssuedBy || 'N/A';
    }
  }

  const priorityIssuedBy = priority.priorityIssuedBy || 'N/A';

  let description = `**Status:** ${priority.priorityActive ? 'Active' : 'Inactive'}\n`;
  description += `**Issued by:** ${priorityIssuedBy}\n`;
  description += `**Cooldown:** ${cooldownText}\n`;
  description += `**Cooldown by:** ${cooldownIssuedBy}`;

  if (priority.customMessage) {
    description += `\n\n${priority.customMessage}`;
  }

  const onCooldown = !!priority.cooldownEndsAt && new Date(priority.cooldownEndsAt) > new Date();
  return {
    title: 'Priority Tracker',
    description,
    color: priority.priorityActive ? 0xFF0000 : onCooldown ? 0xFFA500 : 0x2d2d2d,
    footer: { text: 'RPM' },
  };
}
