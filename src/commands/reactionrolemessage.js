import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import { errorEmbed } from '../utils/embedBuilder.js';
import { checkStaffPermission } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('reactionrolemessage')
  .setDescription('Create a reaction role message (Staff only)');

export async function execute(interaction) {
  try {
    console.log(`📝 /reactionrolemessage called by ${interaction.user.tag} in guild ${interaction.guildId}`);
    console.log(`   Member: ${interaction.member?.user?.tag}`);
    console.log(`   Is admin: ${interaction.member?.permissions?.has('Administrator')}`);
    
    const hasPermission = await checkStaffPermission(interaction);
    console.log(`✓ Permission check: ${hasPermission ? 'PASS' : 'FAIL'}`);

    if (!hasPermission) {
      console.log(`❌ User ${interaction.user.tag} denied - not staff or admin`);
      return interaction.reply({
        embeds: [errorEmbed('You do not have permission to use this command. This is a staff-only command.')],
        ephemeral: true,
      });
    }

    const menu = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('reactionrole_main_menu')
          .setPlaceholder('Pick an option...')
          .addOptions(
            { label: 'Send a New Message', value: 'send_message' },
            { label: 'Add Emoji to Existing Message', value: 'add_emoji' }
          )
      );

    console.log(`✓ Sending menu to ${interaction.user.tag}`);
    await interaction.reply({
      content: '**Reaction Role Setup**\n\nWhat do you want to do?',
      components: [menu],
      ephemeral: true,
    });
    console.log(`✅ Menu sent successfully`);
  } catch (error) {
    console.error('❌ Error in reactionrolemessage command:', error);
    try {
      await interaction.reply({
        embeds: [errorEmbed('An error occurred. Please try again.')],
        ephemeral: true,
      });
    } catch (e) {
      console.error('Failed to send error reply:', e);
    }
  }
}
