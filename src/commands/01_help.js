import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { isPremiumGuild, isFeaturePremiumGated } from '../utils/premiumCheck.js';
import { featureGroups } from '../config/features.js';

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('View all RolePlayManager commands and features');

/**
 * Both halves of this are generated, deliberately.
 *
 * The old /help was a hand-written embed listing ~55 of 77 commands and 13 of
 * 21 config options. Business accounts, loans, civilian jobs, sticky messages
 * and reaction roles were absent entirely, so a server owner reading /help had
 * no way to learn those features existed. Anything hand-maintained here goes
 * stale the moment a command is added, so nothing here is hand-maintained:
 * features come from the registry and commands come from the live command
 * collection the bot actually registered.
 */

const FIELD_LIMIT = 1024;

/** Split lines into as many fields as needed to stay under Discord's per-field cap. */
function chunkField(name, lines) {
  const fields = [];
  let buf = [];
  let len = 0;
  for (const line of lines) {
    if (len + line.length + 1 > FIELD_LIMIT && buf.length) {
      fields.push({ name: fields.length ? `${name} (cont.)` : name, value: buf.join('\n'), inline: false });
      buf = [];
      len = 0;
    }
    buf.push(line);
    len += line.length + 1;
  }
  if (buf.length) {
    fields.push({ name: fields.length ? `${name} (cont.)` : name, value: buf.join('\n'), inline: false });
  }
  return fields;
}

export async function execute(interaction) {
  await interaction.deferReply({ flags: 64 });

  const premium = await isPremiumGuild(interaction.guildId);

  // Resolve premium per feature rather than assuming the defaults - an operator
  // can flip any feature in the dev panel and this follows.
  const groups = featureGroups();
  const gated = {};
  await Promise.all(
    groups.flatMap(([, features]) => features).map(async (f) => {
      gated[f.key] = await isFeaturePremiumGated(f.key).catch(() => f.premiumDefault);
    })
  );

  const featureFields = [];
  for (const [group, features] of groups) {
    if (group === 'Foundation') continue;
    const lines = features.map((f) => {
      const star = gated[f.key] && !premium ? ' ★' : '';
      // Everything with a subcommand is reachable via /config, whether or not
      // the /setup wizard has a step for it yet.
      const how = f.configSubcommand ? `\`/config ${f.configSubcommand}\`` : 'dashboard only';
      return `${how} — **${f.label}**${star} — ${f.short}`;
    });
    featureFields.push(...chunkField(group, lines));
  }

  // The real registered command list, so this can never drift from what exists.
  const names = [...interaction.client.commands.keys()].sort();
  const commandLines = [];
  for (let i = 0; i < names.length; i += 8) {
    commandLines.push(names.slice(i, i + 8).map((n) => `\`/${n}\``).join(' '));
  }

  const embed = new EmbedBuilder()
    .setColor(0x2B2D31)
    .setTitle('RolePlayManager — Features and Commands')
    .setDescription(
      'Run `/setup` to see what is configured and what still needs finishing.\n' +
      'Run `/config <feature>` to set any single feature up.\n\n' +
      (premium
        ? '-# Premium is active on this server.'
        : '-# Features marked ★ need Premium — run `/premium` to learn more.')
    )
    .addFields(...featureFields.slice(0, 20))
    .addFields(...chunkField(`All commands (${names.length})`, commandLines).slice(0, 4))
    .setFooter({ text: 'RPM — /setup shows your server status' });

  return interaction.editReply({ embeds: [embed] });
}
