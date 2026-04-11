import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('View all commands and features');

export async function execute(interaction) {
  const helpEmbed = new EmbedBuilder()
    .setColor('#2d2d2d')
    .setTitle('RolePlayManager')
    .setDescription(
      '### Staff\n' +
      '`/addstaff` `/removestaff` `/stafflist`\n\n' +
      '### Verification\n' +
      '`/verifysystemsetup` `/verify`\n\n' +
      '### Strikes\n' +
      '`/strikesystemsetup` `/strike` `/removestrike`\n\n' +
      '### Priority Tracker\n' +
      '`/prioritytrackersetup` `/activepriority` `/deactivatepriority` `/prioritycooldown`\n\n' +
      '### Roleplay\n' +
      '`/roleplaycommandsetup` `/civiliandatabase` `/leodatabase` `/firedepartmentdatabase`\n\n' +
      '### RP Events\n' +
      '`/setrp` `/unsetrp` `/roleplaycalendersetup`\n\n' +
      '### Tickets & Roles\n' +
      '`/ticketsupportsetup` `/rolerequestadd` `/rolerequest` `/manageroles`\n\n' +
      '### Community\n' +
      '`/reactionrolemessage` `/sticky` `/stickylist` `/antipromotingsetup` `/setlogchannel`\n\n' +
      '### Economy — Staff\n' +
      '`/economysetup` `/storesetup`\n\n' +
      '### Economy — Members\n' +
      '`/economy balance` `/economy leaderboard` `/economy deposit` `/economy withdraw` `/economy give`\n' +
      '`/economy work` `/economy crime` `/economy rob` `/economy income`\n' +
      '`/economy store` `/economy buy` `/economy sell` `/economy use` `/economy inventory` `/economy giveitems`\n' +
      '`/economy blackjack` `/economy roulette` `/economy slots` `/economy roll` `/economy russianroulette` `/economy cockfight`\n\n' +
      '### AI Dispatch — *Premium*\n' +
      '`/dispatchsetup` `/activatepremium`\n\n' +
      '### Utility\n' +
      '`/enablecommands` `/reloadconfig` `/clear` `/embed` `/help`'
    )
    .setFooter({ text: 'RPM' });

  return interaction.reply({
    embeds: [helpEmbed],
    flags: 64,
  });
}
