import { EmbedBuilder } from 'discord.js';

const COLORS = {
  success: '#43b581',
  error:   '#f04747',
  info:    '#2d2d2d',
  warning: '#faa61a',
  neutral: '#2d2d2d',
};

export function createEmbed(options = {}) {
  const embed = new EmbedBuilder()
    .setColor(options.color || COLORS.info)
    .setFooter({ text: 'RPM' });

  if (options.title) embed.setTitle(options.title);
  if (options.description) embed.setDescription(options.description);
  if (options.fields) embed.addFields(options.fields);
  if (options.thumbnail) embed.setThumbnail(options.thumbnail);
  if (options.timestamp) embed.setTimestamp();

  return embed;
}

export function successEmbed(titleOrDescription, description = null) {
  if (description !== null) {
    return createEmbed({
      title: titleOrDescription,
      description,
      color: COLORS.success,
    });
  }
  return createEmbed({
    description: titleOrDescription,
    color: COLORS.success,
  });
}

export function errorEmbed(titleOrDescription, description = null) {
  if (description !== null) {
    return createEmbed({
      title: titleOrDescription,
      description,
      color: COLORS.error,
    });
  }
  return createEmbed({
    description: titleOrDescription,
    color: COLORS.error,
  });
}

export function infoEmbed(title, description) {
  return createEmbed({
    title,
    description,
    color: COLORS.info,
  });
}

export function warningEmbed(titleOrDescription, description = null) {
  if (description !== null) {
    return createEmbed({
      title: titleOrDescription,
      description,
      color: COLORS.warning,
    });
  }
  return createEmbed({
    description: titleOrDescription,
    color: COLORS.warning,
  });
}

export { COLORS };
