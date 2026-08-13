import { EmbedBuilder } from 'discord.js';

const COLORS = {
  success: 0x23A55A,
  error: 0xF23F43,
  info: 0x5865F2,
  warning: 0xFEE75C,
  neutral: 0x2B2D31,
};

export function createEmbed(options = {}) {
  const embed = new EmbedBuilder()
    .setColor(options.color ?? COLORS.info)
    .setTimestamp()
    .setFooter({ text: 'RPM' });

  if (options.title) embed.setTitle(options.title);
  if (options.description) embed.setDescription(options.description);
  if (options.fields) embed.addFields(options.fields);
  if (options.thumbnail) embed.setThumbnail(options.thumbnail);

  return embed;
}

export function successEmbed(titleOrDesc, description) {
  if (description !== undefined) {
    return createEmbed({ title: titleOrDesc, description, color: COLORS.success });
  }
  return createEmbed({ title: 'Success', description: titleOrDesc, color: COLORS.success });
}

export function errorEmbed(titleOrDesc, description) {
  if (description !== undefined) {
    return createEmbed({ title: titleOrDesc, description, color: COLORS.error });
  }
  return createEmbed({ title: 'Error', description: titleOrDesc, color: COLORS.error });
}

export function infoEmbed(title, description) {
  return createEmbed({ title, description, color: COLORS.info });
}

export function warningEmbed(titleOrDesc, description) {
  if (description !== undefined) {
    return createEmbed({ title: titleOrDesc, description, color: COLORS.warning });
  }
  return createEmbed({ title: 'Notice', description: titleOrDesc, color: COLORS.warning });
}

export function neutralEmbed(title, description) {
  return createEmbed({ title, description, color: COLORS.neutral });
}
