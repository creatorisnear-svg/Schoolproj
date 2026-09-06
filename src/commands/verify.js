import { SlashCommandBuilder } from 'discord.js';
import Verification from '../models/Verification.js';
import { errorEmbed } from '../utils/embedBuilder.js';
import { handleVerifyModal } from '../handlers/verifyHandler.js';

export const data = new SlashCommandBuilder()
  .setName('verify')
  .setDescription('Verify yourself to access member channels');

/**
 * The same route as the Verify button on the panel.
 *
 * This used to open an in-Discord modal with customId `verify_modal`, and
 * submitting it went nowhere: index.js called `handleVerifyModalSubmit`, an
 * identifier that exists nowhere in the repo, so every submission threw a
 * ReferenceError that the top level catch logged without ever acknowledging the
 * interaction. Anybody who ran /verify filled the form in and got "This
 * interaction failed". Only the slash command was affected, which is why it
 * went unnoticed: the panel button was already on the flow below.
 *
 * The dead branch is not revived, because the handler behind it predates the
 * move to web verification and never learned to check the blacklist. Restoring
 * it would have handed banned members a way in that bypasses the wall, which is
 * the exact thing the blacklist exists to stop. So /verify now does what the
 * button does: mint a one time token and hand over a link to the form, where
 * the Discord account, the gamertag and the IP are all checked.
 */
export async function execute(interaction) {
  try {
    const verification = await Verification.findOne({ guildId: interaction.guildId });

    if (!verification || !verification.enabled) {
      return interaction.reply({
        embeds: [errorEmbed('Verification Unavailable', 'The verification system is not set up. Please contact an administrator.')],
        flags: 64,
      });
    }

    return handleVerifyModal(interaction);
  } catch (error) {
    console.error('Error starting verification:', error);
    if (interaction.replied || interaction.deferred) return;
    return interaction.reply({
      embeds: [errorEmbed('Something went wrong', 'An error occurred while starting verification. Please try again.')],
      flags: 64,
    }).catch(() => {});
  }
}
