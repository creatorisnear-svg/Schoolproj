import { EmbedBuilder } from 'discord.js';

const COLORS = {
  success: '#2d2d2d',
  error:   '#2d2d2d',
  info:    '#2d2d2d',
  warning: '#2d2d2d',
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
      color: '#2d2d2d',
    });
  }
  return createEmbed({
    description: titleOrDescription,
    color: '#2d2d2d',
  });
}

export function errorEmbed(titleOrDescription, description = null) {
  if (description !== null) {
    return createEmbed({
      title: titleOrDescription,
      description,
      color: '#2d2d2d',
    });
  }
  return createEmbed({
    description: titleOrDescription,
    color: '#2d2d2d',
  });
}

export function infoEmbed(title, description) {
  return createEmbed({
    title,
    description,
    color: '#2d2d2d',
  });
}

export function warningEmbed(titleOrDescription, description = null) {
  if (description !== null) {
    return createEmbed({
      title: titleOrDescription,
      description,
      color: '#2d2d2d',
    });
  }
  return createEmbed({
    description: titleOrDescription,
    color: '#2d2d2d',
  });
}

export { COLORS };
