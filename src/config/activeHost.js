import { existsSync } from 'fs';

/**
 * Which host runs the bot: 'koyeb' or 'dell'.
 *
 * Both run this same code from main (Koyeb deploys every push, and the Dell's
 * updater pulls it), so the one not named here stands by in index.js instead
 * of logging in to Discord. Two copies on one bot token would answer every
 * command twice. To move the bot, change this, point the website and the
 * Stripe webhook at the new host, and push.
 *
 * The Dell again since 2026-10-24: it was down overnight and came back the
 * next morning; Koyeb stays paused as the backup.
 */
export const ACTIVE_HOST = 'dell';

/** Where this copy is running, or null when that cannot be told (a laptop, a test). */
export function thisHost() {
  const domain = process.env.DOMAIN || '';
  if (process.env.KOYEB_APP_NAME || process.env.KOYEB_SERVICE_NAME || /koyeb\.app/i.test(domain)) return 'koyeb';
  if (/\.ts\.net/i.test(domain) || existsSync('/etc/roleplaymanager.env')) return 'dell';
  return null;
}

/** Only a host that knows it is the other one stands by; an unknown one runs. */
export function standingBy() {
  const here = thisHost();
  return !!here && here !== ACTIVE_HOST;
}
