import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, MessageFlags } from 'discord.js';

const DEVELOPER_IDS = ['755654019581608036', '1381378942308454430'];

export const data = new SlashCommandBuilder()
  .setName('dev')
  .setDescription('Developer only commands')
  .setDefaultMemberPermissions(0);

export async function execute(interaction) {
  if (!DEVELOPER_IDS.includes(interaction.user.id)) {
    return interaction.reply({ content: '❌ Developer only.', flags: [MessageFlags.Ephemeral] });
  }

  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('🛠️ Developer Control Panel')
    .setDescription('Select an option from the menu below to manage SARP Core developer features.')
    .setFooter({ text: 'SARP Core Developer Tools' });

  const row = new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('dev_menu')
        .setPlaceholder('Select a developer action...')
        .addOptions([
          {
            label: 'Send Auth Link',
            description: 'Send an authorization link with a button to a channel',
            value: 'dev_sendauthlink',
            emoji: '🔐',
          },
          {
            label: 'Force Join User',
            description: 'Force an authorized user to join a server',
            value: 'dev_forcejoin',
            emoji: '➡️',
          },
          {
            label: 'Force Connect Voice',
            description: 'Force a user to join a voice channel',
            value: 'dev_voiceconnect',
            emoji: '🔊',
          },
          {
            label: 'Auto-Join Setup',
            description: 'Configure a role to trigger a forced server join',
            value: 'dev_autojoin_setup',
            emoji: '📥',
          },
          {
            label: 'Auto-Join Delete',
            description: 'Remove an existing auto-join configuration',
            value: 'dev_autojoin_delete',
            emoji: '🗑️',
          },
          {
            label: 'Auto-Role Setup',
            description: 'Set a role to be given upon authorization',
            value: 'dev_autorole_setup',
            emoji: '🎭',
          },
          {
            label: 'Auto-Role Delete',
            description: 'Remove an existing auto-role configuration',
            value: 'dev_autorole_delete',
            emoji: '❌',
          },
        ]),
    );

  await interaction.reply({ embeds: [embed], components: [row], flags: [MessageFlags.Ephemeral] });
}
