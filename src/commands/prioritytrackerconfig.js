import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';

/**
 * Deprecated shim.
 *
 * This command was one of ~16 that duplicated a /config subcommand. config.js
 * has said it "replaces all individual xxxconfig commands" since it was
 * written, but nothing was ever deleted, so admins saw two of everything and
 * the two halves enforced different rules - the legacy commands still demanded
 * /setlogchannel and /enablecommands first, which /config had dropped.
 *
 * Kept for one release so the old name redirects instead of vanishing.
 * Safe to delete after that, which frees a slot against the 100/guild cap.
 */
export const data = new SlashCommandBuilder()
  .setName('prioritytrackerconfig')
  .setDescription('Moved — use /config priority instead (Admin)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction) {
  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor('#2d2d2d')
        .setTitle('This command moved')
        .setDescription(
          '`/prioritytrackerconfig` is now `/config priority`.\n\n' +
          'Every feature is set up from that one command now. Run `/setup` to see what is already configured and what still needs finishing.'
        )
        .setFooter({ text: 'RPM' }),
    ],
    flags: 64,
  });
}
