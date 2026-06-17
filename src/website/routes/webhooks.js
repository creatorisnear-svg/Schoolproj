import express from 'express';
import { recordVote } from '../../utils/premiumCheck.js';

export function createWebhooksRouter(client) {
  const router = express.Router();

  router.get('/topgg', (req, res) => {
    res.json({ ok: true, message: 'TopGG webhook endpoint is reachable' });
  });

  router.post('/topgg', async (req, res) => {
    const secret = process.env.TOPGG_WEBHOOK_SECRET;
    const incomingAuth = req.headers['authorization'] || '(none)';

    if (secret) {
      if (incomingAuth !== secret) {
        console.warn(`[TopGG Webhook] Auth FAILED — expected secret, got: "${incomingAuth}"`);
        return res.status(401).json({ error: 'Unauthorized' });
      }
    } else {
      console.log('[TopGG Webhook] No secret set — accepting all requests');
    }

    const { user, type, isWeekend } = req.body;
    console.log(`[TopGG Webhook] Payload — type=${type} user=${user} isWeekend=${isWeekend}`);

    if (!user || type !== 'upvote') {
      console.log(`[TopGG Webhook] Ignoring non-upvote type: ${type}`);
      return res.status(200).json({ ok: true });
    }

    try {
      await recordVote(user);
      console.log(`[TopGG Webhook] Vote credit recorded for user ${user}`);

      const discordUser = await client.users.fetch(user).catch(() => null);
      if (discordUser) {
        const { EmbedBuilder } = await import('discord.js');
        const embed = new EmbedBuilder()
          .setColor(0x2d2d2d)
          .setTitle('Thanks for Voting')
          .setDescription(
            `Your vote on Top.gg has been recorded.\n\n` +
            `You now have a **3-day free trial credit** — use \`/activatetrial\` in the server you want to activate it for.\n\n` +
            `-# Each server can only claim one free trial, ever. Your credit expires in 7 days if unused.`
          )
          .setFooter({ text: 'RPM' });
        discordUser.send({ embeds: [embed] }).catch(() => {});
      } else {
        console.warn(`[TopGG Webhook] Could not fetch Discord user ${user} to send DM`);
      }
    } catch (err) {
      console.error('[TopGG Webhook] Error recording vote:', err);
    }

    res.status(200).json({ ok: true });
  });

  return router;
}
