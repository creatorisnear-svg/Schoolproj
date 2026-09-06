import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import RoleplayCommands from '../models/RoleplayCommands.js';
import CADConfig from '../models/CADConfig.js';
import { errorEmbed } from '../utils/embedBuilder.js';

const CAD_URL = 'https://roleplaymanager.xyz/cad';

export const data = new SlashCommandBuilder()
  .setName('cad')
  .setDescription('Open the web CAD for this server');

export async function execute(interaction) {
  try {
    const [roleplayConfig, cadConfig] = await Promise.all([
      RoleplayCommands.findOne({ guildId: interaction.guildId }),
      CADConfig.findOne({ guildId: interaction.guildId }),
    ]);

    // Same gate the database commands use: the CAD reads the records the
    // roleplay commands own, so with those off there is nothing there to open.
    if (!roleplayConfig?.enabled) {
      return interaction.reply({
        embeds: [errorEmbed(
          'CAD Not Available',
          'Roleplay commands are not enabled on this server. An administrator can turn them on with `/setup`.'
        )],
        flags: 64,
      });
    }

    // Whether this person will see the law enforcement side, so the reply
    // describes what they will actually get rather than the full feature list.
    const leoRoleIds = cadConfig?.leoRoleIds ?? [];
    const isLeo = leoRoleIds.length > 0
      && interaction.member?.roles?.cache?.some((r) => leoRoleIds.includes(r.id));

    const civilian = [
      '**Civilian**',
      'Your characters, vehicles and firearms, calling 911, paying fines,',
      'and seeing who is on duty.',
    ].join('\n');

    const leo = [
      '',
      '',
      '**Law Enforcement**',
      'Run a plate or a name, work the live 911 queue, issue tickets,',
      'create BOLOs, set your 10-code and hit the panic button.',
    ].join('\n');

    const embed = new EmbedBuilder()
      .setColor('#2d2d2d')
      .setTitle('Web CAD')
      .setDescription(
        'Sign in with Discord and pick this server. Everything is the same data '
        + 'as the commands here, so a character you make on the site is the one '
        + 'officers find when they run your name.\n\n'
        + civilian
        + (isLeo ? leo : '')
      )
      .setFooter({ text: 'RPM • roleplaymanager.xyz/cad' });

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Open the CAD')
        .setStyle(ButtonStyle.Link)
        .setURL(CAD_URL)
    );

    return interaction.reply({ embeds: [embed], components: [buttons], flags: 64 });
  } catch (error) {
    console.error('Error executing cad:', error);
    return interaction.reply({
      embeds: [errorEmbed('Unexpected Error', 'Something went wrong. Please try again.')],
      flags: 64,
    });
  }
}
