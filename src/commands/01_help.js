import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import { isPremiumGuild, isFeaturePremiumGated } from '../utils/premiumCheck.js';
import { featureGroups } from '../config/features.js';

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Browse everything RolePlayManager can do');

/**
 * A menu, not a wall.
 *
 * This used to answer with a single embed carrying up to twenty four fields:
 * every feature in every group, then all seventy eight command names.
 * Everything was technically there, which is why it was hard to use. Nobody
 * reads a page that long to find one command, and on a phone the answer
 * scrolled for screens.
 *
 * Now the first screen says the three things a new owner needs and offers a
 * menu. Pick a category and you get that category only, at a length you can
 * actually read. The content is still generated, from the feature registry and
 * the live command collection, so it cannot drift from what the bot registered.
 */

const COLOR = 0x2B2D31;
const FIELD_LIMIT = 1024;

/** Split lines into fields that stay under Discord's per-field cap. */
function chunkField(name, lines) {
  const fields = [];
  let buf = [];
  let len = 0;
  for (const line of lines) {
    if (len + line.length + 1 > FIELD_LIMIT && buf.length) {
      fields.push({ name: fields.length ? `${name} (continued)` : name, value: buf.join('\n') });
      buf = [];
      len = 0;
    }
    buf.push(line);
    len += line.length + 1;
  }
  if (buf.length) fields.push({ name: fields.length ? `${name} (continued)` : name, value: buf.join('\n') });
  return fields;
}

/** Which features are premium right now, honouring any dev panel override. */
async function resolveGating(groups) {
  const gated = {};
  await Promise.all(
    groups.flatMap(([, features]) => features).map(async (f) => {
      gated[f.key] = await isFeaturePremiumGated(f.key).catch(() => f.premiumDefault);
    })
  );
  return gated;
}

function menuRow(selected) {
  const groups = featureGroups().filter(([g]) => g !== 'Foundation');
  const options = [
    {
      label: 'Getting started',
      value: 'start',
      description: 'What to set up first',
      default: selected === 'start',
    },
    ...groups.map(([group, features]) => ({
      label: group,
      value: 'group:' + group,
      description: `${features.length} feature${features.length === 1 ? '' : 's'}`,
      default: selected === 'group:' + group,
    })),
    {
      label: 'Every command',
      value: 'commands',
      description: 'The full list of slash commands',
      default: selected === 'commands',
    },
  ];

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('help_category')
      .setPlaceholder('Choose what to read about')
      .addOptions(options.slice(0, 25))
  );
}

/**
 * Build the embed for one menu choice.
 * Exported so the select handler renders through exactly this path.
 */
export async function buildHelpView(interaction, choice = 'start') {
  const premium = await isPremiumGuild(interaction.guildId);
  const groups = featureGroups();

  const embed = new EmbedBuilder().setColor(COLOR).setFooter({ text: 'RPM' });

  if (choice === 'commands') {
    const names = [...interaction.client.commands.keys()].sort();
    const lines = [];
    for (let i = 0; i < names.length; i += 6) {
      lines.push(names.slice(i, i + 6).map((n) => `\`/${n}\``).join('  '));
    }
    embed
      .setTitle('Every command')
      .setDescription(`${names.length} commands are registered on this server.`)
      .addFields(...chunkField('Commands', lines).slice(0, 6));
    return embed;
  }

  if (choice.startsWith('group:')) {
    const wanted = choice.slice(6);
    const entry = groups.find(([g]) => g === wanted);
    if (!entry) return buildHelpView(interaction, 'start');

    const [group, features] = entry;
    const gated = await resolveGating([[group, features]]);
    const lines = features.map((f) => {
      const tag = gated[f.key] && !premium ? '  `Premium`' : '';
      const how = f.configSubcommand ? `\`/config ${f.configSubcommand}\`` : '`dashboard only`';
      return `**${f.label}**${tag}\n${f.short}\nSet up with ${how}`;
    });

    embed
      .setTitle(group)
      .setDescription(`${features.length} feature${features.length === 1 ? '' : 's'} in this group.`)
      .addFields(...chunkField(group, lines).slice(0, 6));
    return embed;
  }

  // Getting started, the landing view.
  const groupNames = groups.filter(([g]) => g !== 'Foundation').map(([g]) => g);
  embed
    .setTitle('RolePlayManager')
    .setDescription(
      'Everything the bot does, one category at a time. Pick one from the menu below.\n\n' +
      '**Three things to do first**\n' +
      '`1.` Run `/setup` to see what is configured and what is still missing.\n' +
      '`2.` Run `/config <feature>` to set any one feature up.\n' +
      '`3.` Open the web dashboard with the button below to do the same in a browser.\n\n' +
      (premium
        ? '-# Premium is active on this server.'
        : '-# Features marked Premium need a subscription. Run `/premium` to try everything free for 7 days.')
    )
    .addFields({ name: 'Categories', value: groupNames.map((g) => `**${g}**`).join(' · ') });
  return embed;
}

export async function execute(interaction) {
  await interaction.deferReply({ flags: 64 });
  const embed = await buildHelpView(interaction, 'start');
  return interaction.editReply({ embeds: [embed], components: [menuRow('start')] });
}

/** The category menu under /help. */
export async function handleHelpCategory(interaction) {
  const choice = interaction.values?.[0] || 'start';
  const embed = await buildHelpView(interaction, choice);
  return interaction.update({ embeds: [embed], components: [menuRow(choice)] });
}
