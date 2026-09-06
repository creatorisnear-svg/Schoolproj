import { PermissionFlagsBits } from 'discord.js';
import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import { checkStaffPermission } from '../utils/permissions.js';
import { errorEmbed } from '../utils/embedBuilder.js';
import { featureGroups, getFeature } from '../config/features.js';
import { getAllFeatureStatus, summarize } from '../utils/featureStatus.js';
import { SUPPORTED_MODULES } from '../handlers/setupWizardHandler.js';
import Config from '../models/Config.js';

export const data = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Step-by-step setup guide — start here if you just added the bot (Admin/Staff)');

const MARK = { ready: '`✓`', incomplete: '`!`', off: '`✗`', unknown: '`?`' };

/** Turn required field names into something an owner can act on. */
function missingText(missing) {
  if (!missing.length) return '';
  const pretty = missing
    .map((f) => f.replace(/Ids?$/, '').replace(/([A-Z])/g, ' $1').trim().toLowerCase())
    .join(', ');
  return ` — needs ${pretty}`;
}

export async function execute(interaction) {
  if (!await checkStaffPermission(interaction)) {
    return interaction.reply({
      embeds: [errorEmbed('Only staff and administrators can run this command.')],
      flags: 64,
    });
  }

  await interaction.deferReply({ flags: 64 });

  const guildId = interaction.guildId;

  try {
    // One registry-driven pass instead of thirteen hand-maintained model reads.
    const [config, statuses] = await Promise.all([
      Config.findOne({ guildId }),
      getAllFeatureStatus(guildId),
    ]);

    const hasLog = !!config?.logChannelId;
    const counts = summarize(statuses);

    // ── Next step ────────────────────────────────────────────────────────────
    // No /staff gate here. checkStaffPermission above already passes any
    // administrator, so telling the owner to grant themselves a permission they
    // already hold was pure friction, and the only button offered in that state
    // was a link to the dashboard.
    let nextStepTitle = null;
    let nextStepText = null;
    let color = '#2d2d2d';

    const needsAttention = Object.entries(statuses)
      .filter(([, s]) => s.status === 'incomplete')
      .map(([key]) => getFeature(key))
      .filter(Boolean);

    if (!hasLog) {
      color = '#fee75c';
      nextStepTitle = 'Start here — set a log channel';
      nextStepText =
        'The bot records verifications, strikes, tickets and bans in one staff-only channel.\n\n' +
        '**Right now:** pick **General Settings** below, then choose a channel like `#bot-logs`.';
    } else if (needsAttention.length) {
      color = '#fee75c';
      const names = needsAttention.slice(0, 3).map((f) => f.label).join(', ');
      nextStepTitle = `${needsAttention.length} feature${needsAttention.length === 1 ? '' : 's'} turned on but not finished`;
      nextStepText =
        `${names}${needsAttention.length > 3 ? ' and others' : ''} ${needsAttention.length === 1 ? 'is' : 'are'} enabled but still missing something, so members cannot use ${needsAttention.length === 1 ? 'it' : 'them'} yet.\n\n` +
        '**Right now:** pick one below and fill in what it asks for.';
    } else if (counts.ready === 0) {
      color = '#5865f2';
      nextStepTitle = 'Turn on your first feature';
      nextStepText =
        'Your foundation is set. Pick what you want to use — **Verification** and **Welcome Messages** are good first picks.';
    }

    // ── Status, grouped exactly as the registry orders it ─────────────────────
    const sections = [];
    for (const [group, features] of featureGroups()) {
      if (group === 'Foundation') continue;
      const lines = features.map((f) => {
        const s = statuses[f.key] || { status: 'off', missing: [] };
        const premium = f.premiumDefault ? ' *(Premium)*' : '';
        const detail = s.status === 'ready' ? 'ready'
          : s.status === 'incomplete' ? `on${missingText(s.missing)}`
          : s.status === 'unknown' ? 'unavailable'
          : 'off';
        return `${MARK[s.status] || MARK.off} **${f.label}**${premium} — ${detail}`;
      });
      sections.push(`### ${group}\n${lines.join('\n')}`);
    }

    const descParts = [];
    if (nextStepTitle) {
      descParts.push(`### ${nextStepTitle}\n${nextStepText}`);
      descParts.push('─────────────────────────────');
    }
    descParts.push(
      '### Foundation\n' +
      `${hasLog ? MARK.ready : MARK.off} **Log channel** — ${hasLog ? `<#${config.logChannelId}>` : 'not set — pick "General Settings" below'}`
    );
    descParts.push(...sections);
    descParts.push(
      `-# ${counts.ready} ready · ${counts.incomplete} need finishing · ${counts.off} off. ` +
      'Pick anything below to set it up, or use the dashboard at roleplaymanager.xyz/dashboard.'
    );

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle('Server Setup')
      .setDescription(descParts.join('\n\n').slice(0, 4000))
      .setFooter({ text: 'RPM — run /setup anytime to check your status' });

    // ── Menu, built from the registry ────────────────────────────────────────
    // Filtered by what the wizard can actually handle, so an option can never
    // fall through to "Unknown option selected" the way 911/CAD did.
    const menuOptions = [];
    for (const [, features] of featureGroups()) {
      for (const f of features) {
        if (!f.configSubcommand || !SUPPORTED_MODULES.includes(f.configSubcommand)) continue;
        menuOptions.push({
          label: (f.premiumDefault ? `${f.label} (Premium)` : f.label).slice(0, 100),
          description: f.short.slice(0, 100),
          value: f.configSubcommand,
        });
      }
    }
    if (SUPPORTED_MODULES.includes('features')) {
      menuOptions.push({
        label: 'Enable / Disable Features',
        description: 'Turn features on or off',
        value: 'features',
      });
    }

    const configRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('setup_config_select')
        .setPlaceholder(hasLog ? 'Pick a feature to set up...' : 'Start with General Settings...')
        .addOptions(menuOptions.slice(0, 25))
    );

    return interaction.editReply({ embeds: [embed], components: [configRow] });

  } catch (err) {
    console.error('[/setup]', err);
    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor('#ed4245')
          .setTitle('Something went wrong')
          .setDescription('Could not load your setup status. Please try again in a moment.')
          .setFooter({ text: 'RPM' }),
      ],
    });
  }
}

// Configuration is administrator work. This hides the command from members
// who cannot Manage Server, so the command picker is not 60% options they
// cannot run. Day-to-day staff commands are deliberately left visible: the
// bot's own Staff table is not expressible as a Discord permission, so
// hiding those would break staff added with /staff add.
data.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
