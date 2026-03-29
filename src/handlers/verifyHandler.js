import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import Verification from '../models/Verification.js';
import PendingVerification from '../models/PendingVerification.js';
import Config from '../models/Config.js';
import { errorEmbed, successEmbed, infoEmbed } from '../utils/embedBuilder.js';

export async function handleVerifyModal(interaction) {
  try {
    const verification = await Verification.findOne({ guildId: interaction.guildId });

    if (!verification || !verification.enabled) {
      return interaction.reply({
        embeds: [errorEmbed('The verification system is not enabled.')],
        flags: 64,
      });
    }

    const modal = new ModalBuilder()
      .setCustomId('verify_modal')
      .setTitle('RolePlayManager Verification');

    const psnXboxInput = new TextInputBuilder()
      .setCustomId('psnxbox')
      .setLabel('PSN / XBOX Username')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(psnXboxInput));

    if (verification.customQuestions && verification.customQuestions.length > 0) {
      const customInput = new TextInputBuilder()
        .setCustomId('custom_question')
        .setLabel(verification.customQuestions[0])
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(customInput));
    }

    await interaction.showModal(modal);
  } catch (error) {
    console.error('Error showing verify modal:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ embeds: [errorEmbed('An error occurred.')], flags: 64 }).catch(() => {});
    }
  }
}

export async function handleVerifyModalSubmit(interaction) {
  const psnxbox = interaction.fields.getTextInputValue('psnxbox');
  let customAnswer = null;
  try {
    customAnswer = interaction.fields.getTextInputValue('custom_question');
  } catch (e) {}

  console.log(`[VERIFY] User ${interaction.user.tag} (${interaction.user.id}) submitted verification. PSN/XBOX: ${psnxbox}`);

  try {
    const verification = await Verification.findOne({ guildId: interaction.guildId });
    if (!verification || !verification.enabled) {
      console.warn(`[VERIFY] Verification attempt in guild ${interaction.guildId} but system is disabled/missing.`);
      return;
    }

    if (verification.oauthRequired) {
      const userData = await AuthorizedUser.findOne({ userId: interaction.user.id });
      if (!userData || !userData.accessToken) {
        const clientId = process.env.DISCORD_CLIENT_ID;
        const domain = process.env.DOMAIN || 'severe-daryl-officialplaystation5-0f1738f5.koyeb.app';
        const cleanDomain = domain.toLowerCase().trim().replace(/^https?:\/\//, '').split('/')[0];
        const redirectUri = `https://${cleanDomain}/callback`;
        const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify%20guilds%20guilds.join%20connections%20voice`;

        const authEmbed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle('🔐 Additional Authorization Required')
          .setDescription('To complete your verification, you must authorize your Discord account with RolePlayManager.\n\nPlease click the button below to authorize, then click the **Verify** button again to submit your application.')
          .setFooter({ text: 'RolePlayManager' });

        const authRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setLabel('Authorize Account').setURL(authUrl).setStyle(ButtonStyle.Link)
        );

        return interaction.reply({ embeds: [authEmbed], components: [authRow], flags: 64 });
      }
    }

    if (verification.approvalRequired) {
      console.log(`[VERIFY] Approval required for ${interaction.user.tag}. Creating pending record.`);
      const pending = new PendingVerification({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        username: interaction.user.username,
        psnxbox,
        customAnswer,
      });
      await pending.save();

      if (verification.approvalChannelId) {
        const approvalChannel = await interaction.guild.channels.fetch(verification.approvalChannelId).catch(() => null);
        if (approvalChannel) {
          const embed = new EmbedBuilder()
            .setColor('#FFA500')
            .setTitle('RolePlayManager Verification Pending')
            .addFields(
              { name: 'Member', value: `${interaction.user}`, inline: true },
              { name: 'PSN/XBOX', value: psnxbox, inline: true }
            )
            .setFooter({ text: 'RolePlayManager' });

          if (customAnswer) {
            embed.addFields({ name: 'Custom Question Answer', value: customAnswer });
          }

          const approveButton = new ButtonBuilder()
            .setCustomId(`verify_approve_${pending._id}`)
            .setLabel('Approve')
            .setStyle(ButtonStyle.Success);

          const rejectButton = new ButtonBuilder()
            .setCustomId(`verify_reject_${pending._id}`)
            .setLabel('Reject')
            .setStyle(ButtonStyle.Danger);

          const row = new ActionRowBuilder().addComponents(approveButton, rejectButton);

          await approvalChannel.send({ embeds: [embed], components: [row] });
          console.log(`[VERIFY] Sent pending request for ${interaction.user.tag} to channel ${verification.approvalChannelId}`);
        } else {
          console.warn(`[VERIFY] Could not find approval channel ${verification.approvalChannelId} for guild ${interaction.guildId}`);
        }
      }

      return interaction.reply({ embeds: [infoEmbed('Submitted', 'Awaiting approval.')], flags: 64 });
    }

    console.log(`[VERIFY] Instant verification for ${interaction.user.tag}. Applying roles.`);
    const role = interaction.guild.roles.cache.get(verification.verifiedRoleId);
    if (role) {
      await interaction.member.roles.add(role);
      console.log(`[VERIFY] Added verified role ${verification.verifiedRoleId} to ${interaction.user.tag}`);
    } else {
      console.error(`[VERIFY] Verified role ${verification.verifiedRoleId} not found in guild ${interaction.guildId}`);
    }
    
    const unverifiedRole = interaction.guild.roles.cache.get(verification.unverifiedRoleId);
    if (unverifiedRole) {
      await interaction.member.roles.remove(unverifiedRole);
      console.log(`[VERIFY] Removed unverified role ${verification.unverifiedRoleId} from ${interaction.user.tag}`);
    }

    return interaction.reply({ embeds: [successEmbed('Verified', 'You are now verified!')], flags: 64 });
  } catch (error) {
    console.error(`[VERIFY ERROR] Exception for ${interaction.user.tag}:`, error);
  }
}
