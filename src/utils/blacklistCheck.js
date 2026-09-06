/**
 * Who the blacklist stops at the verification wall.
 *
 * This lived inline in the verify route and only looked at two of the three
 * things an entry can carry. An entry naming a Discord account matched nothing,
 * so the ordinary way to blacklist somebody, `/blacklist @them`, kicked them
 * once and then let them verify straight back in. If they had never verified
 * before there was no gamertag on file either, so the entry did nothing at all.
 *
 * One function now, used by the wall and by the tests, so the two cannot drift.
 */

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[n];
}

/**
 * Close enough to count as the same gamertag. People re-register with a digit
 * changed, so an exact match alone is easy to walk around.
 */
export function isSimilar(input, blacklisted) {
  const a = String(input || '').toLowerCase().trim();
  const b = String(blacklisted || '').toLowerCase().trim();
  if (!a || !b) return false;
  if (a === b) return true;
  const maxLen = Math.max(a.length, b.length);
  const dist = levenshtein(a, b);
  return 1 - dist / maxLen >= 0.8 || dist <= 2;
}

/**
 * @param {Array} entries  active Blacklist documents for the guild
 * @param {{ userId?: string, gamertag?: string, ip?: string }} who
 * @returns {{ entry: object, matchedOn: 'discord'|'ip'|'gamertag' } | null}
 */
export function findBlacklistMatch(entries, { userId, gamertag, ip } = {}) {
  if (!Array.isArray(entries) || !entries.length) return null;

  // Discord first: it is the one the staff member actually chose, and it needs
  // no guessing to be sure about.
  if (userId) {
    const hit = entries.find((e) => e.discordId && e.discordId === userId);
    if (hit) return { entry: hit, matchedOn: 'discord' };
  }

  // An entry flagged for an IP ban with no address on file must match nobody.
  // Without the ipAddress guard, `undefined === undefined` would lock out every
  // single person trying to verify.
  if (ip && ip !== 'unknown') {
    const hit = entries.find((e) => e.ipBanned && e.ipAddress && e.ipAddress === ip);
    if (hit) return { entry: hit, matchedOn: 'ip' };
  }

  if (gamertag && String(gamertag).trim()) {
    const hit = entries.find((e) => e.gamertag && isSimilar(gamertag, e.gamertag));
    if (hit) return { entry: hit, matchedOn: 'gamertag' };
  }

  return null;
}
