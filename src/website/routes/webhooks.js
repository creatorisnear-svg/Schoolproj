import express from 'express';
import { recordVote } from '../../utils/premiumCheck.js';
import { rewardVoteInServers, thanksMessage } from '../../utils/voteRewards.js';

export function createWebhooksRouter(client) {
  const router = express.Router();

  router.get('/topgg', (req, res) => {
    res.json({ ok: true, message: 'TopGG webhook endpoint is reachable' });
  });

  router.post('/topgg', async (req, res) => {
    // Fails closed. This used to accept every request when no secret was set,
    // which let anybody post votes on behalf of any user id they chose.
    const secret = process.env.TOPGG_WEBHOOK_SECRET;
    if (!secret) {
      console.warn('[TopGG Webhook] Rejected: TOPGG_WEBHOOK_SECRET is not set.');
      return res.status(503).json({ error: 'Webhook is not configured.' });
    }
    if (req.headers['authorization'] !== secret) {
      console.warn('[TopGG Webhook] Auth failed.');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const body = req.body || {};
    const user = body.user || body.userId || body.id;
    const type = body.type;
    const isWeekend = body.isWeekend;
    console.log(`[TopGG Webhook] Payload - type=${type} user=${user} isWeekend=${isWeekend} raw=${JSON.stringify(body)}`);

    const VOTE_TYPES = ['upvote', 'vote', 'vote.create'];
    if (!user || !VOTE_TYPES.includes(type)) {
      console.log(`[TopGG Webhook] Ignoring non-upvote type: ${type}`);
      return res.status(200).json({ ok: true });
    }

    try {
      await recordVote(user);
      console.log(`[TopGG Webhook] Vote credit recorded for user ${user}`);

      // A real reward: cash in every server where the voter uses the economy.
      const weekend = !!isWeekend;
      const paid = await rewardVoteInServers(client, String(user), weekend).catch((err) => {
        console.error('[TopGG Webhook] Reward failed:', err.message);
        return [];
      });
      const discordUser = await client.users.fetch(user).catch(() => null);
      if (discordUser) {
        discordUser.send(thanksMessage(client, paid, weekend)).catch(() => {});
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
