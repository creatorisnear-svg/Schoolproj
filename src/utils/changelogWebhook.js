/**
 * Fires a Discord webhook embed when a changelog entry is created or updated.
 * Reads CHANGELOG_WEBHOOK_URL from env — silently no-ops if not set.
 */

export async function sendChangelogWebhook(changelog, { isUpdate = false } = {}) {
  const url = process.env.CHANGELOG_WEBHOOK_URL;
  if (!url) return;

  const changeList = Array.isArray(changelog.changes) && changelog.changes.length
    ? changelog.changes.map(c => `- ${c}`).join('\n')
    : null;

  const embed = {
    color: 0x5865f2,
    title: `${isUpdate ? 'Updated' : 'New'} — v${changelog.version}: ${changelog.title}`,
    description: changeList || null,
    footer: { text: 'RPM' },
    timestamp: new Date().toISOString(),
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });
    if (!res.ok) {
      console.error(`[changelogWebhook] Discord returned ${res.status}`);
    }
  } catch (err) {
    console.error('[changelogWebhook] Failed to send webhook:', err.message);
  }
}
