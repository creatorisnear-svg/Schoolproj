import axios from 'axios';
import { createHash } from 'crypto';

/**
 * Discord API calls made with a website visitor's sign-in token.
 *
 * Discord blocks an IP for a while once it sends 10,000 requests in 10 minutes
 * that come back 401, 403 or 429, and these calls leave from the bot's own IP.
 * Before this, anyone could send made-up tokens to the website, each costing
 * one or two refused calls, until the whole bot was cut off from Discord. So a
 * token Discord refused is not asked about again for a while, and once refusals
 * pile up in a window the website stops asking at all until the window ends.
 */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REFUSED = 1500; // per window, far below Discord's 10,000
const refusedTokens = new Map(); // sha256(token) -> until
let windowStart = 0;
let refused = 0;

const keyOf = (token) => createHash('sha256').update(String(token)).digest('base64url');

/** Thrown instead of asking Discord; `status` is what the route should answer. */
export class SignInRefused extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
    // Shaped like an axios error, so callers that look at err.response.status
    // treat it the same as Discord refusing the token.
    this.response = { status, data: { message } };
  }
}

export async function discordUserGet(path, token) {
  const now = Date.now();
  if (now - windowStart > WINDOW_MS) { windowStart = now; refused = 0; }
  const key = keyOf(token);
  const until = refusedTokens.get(key);
  if (until && until > now) throw new SignInRefused('Discord has already refused this sign-in.', 401);
  if (refused >= MAX_REFUSED) throw new SignInRefused('Sign-in checks are paused for a few minutes.', 503);

  try {
    return await axios.get('https://discord.com/api' + path, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10000,
    });
  } catch (err) {
    const status = err.response?.status;
    if (status === 401 || status === 403 || status === 429) {
      refused++;
      if (status === 401) refusedTokens.set(key, now + WINDOW_MS);
      if (refused === MAX_REFUSED) {
        console.warn(`[SignIn] ${MAX_REFUSED} sign-in checks refused by Discord in 10 minutes; pausing them so the bot's IP is not blocked.`);
      }
    }
    throw err;
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [k, until] of refusedTokens) if (until < now) refusedTokens.delete(k);
}, WINDOW_MS).unref();
