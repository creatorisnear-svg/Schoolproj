---
name: Auto-Changelog Requirement
description: Agent must update changelog-next.json after every set of changes before the user pushes to GitHub.
---

# Auto-Changelog Requirement

After every update session, update `changelog-next.json` in the repo root before the user pushes to GitHub. Do not skip this.

**How it works:** On Koyeb startup, `src/index.js` reads `changelog-next.json`, checks if that version already exists in MongoDB, and if not — creates the `Changelog` entry and fires a Discord webhook automatically.

**Agent workflow after every set of changes:**
1. Bump the version (semver)
2. Update `title` and `changes` array to describe what was done
3. File format:
```json
{
  "version": "1.2.3",
  "title": "Short description",
  "changes": ["Added X", "Fixed Y"]
}
```

**Key files:**
- `changelog-next.json` — the pending release descriptor (agent maintains this)
- `src/utils/changelogWebhook.js` — Discord webhook sender utility
- `src/index.js` ~line 1155 — startup hook that reads the file

**Why:** Koyeb reads the file on deploy and auto-posts to Discord. If the agent doesn't update it, the changelog stays stale or re-posts a duplicate version.
