import { EmbedBuilder } from 'discord.js';

export function createEmbed(options = {}) {
  const embed = new EmbedBuilder()
    .setColor(options.color || '#00ff00')
    .setTimestamp()
    .setFooter({ text: 'SΛRP GTA 5 PS5 Roleplay' });

  if (options.title) embed.setTitle(options.title);
  if (options.description) embed.setDescription(options.description);
  if (options.fields) embed.addFields(options.fields);
  if (options.thumbnail) embed.setThumbnail(options.thumbnail);

  return embed;
}

export function successEmbed(description) {
  return createEmbed({
    title: '__**Success**__',
    description,
    color: '#00ff00',
  });
}

export function errorEmbed(description) {
  return createEmbed({
    title: '__**Error**__',
    description,
    color: '#ff0000',
  });
}

export function infoEmbed(title, description) {
  return createEmbed({
    title,
    description,
    color: '#0099ff',
  });
}
