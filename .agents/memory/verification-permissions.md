---
name: Verification Permissions Are Owner-Managed
description: The bot never sets channel permissions. Do not re-add a permission engine to the verification flow.
---

# Verification Permissions Are Owner-Managed

**The bot assigns and removes the verified / unverified roles. It does not touch channel permissions. Server owners set those themselves in Discord.**

Do not "fix" this by adding code that writes `permissionOverwrites`. It was tried, it did not work, and one part of it was destructive.

## What was removed (Sep 2026)

Three functions in `src/handlers/selectMenuHandler.js`, ~160 lines:

- `setVerificationChannelPermissions` — **zero callers**, never ran
- `applyAllVerificationPermissions` — **zero callers**, never ran
- `revertVerificationPermissions` — **was live**, called from `enableCommandsHandler` on `disable_verification`

The third is the reason this note exists. It iterated every text channel in the guild and called `permissionOverwrites.delete()` for the verified and unverified roles. Because the other two functions never ran, the bot had never created those overwrites — so the only ones it could delete were **the owner's own**. Disabling verification could quietly strip a server's access control, while the success embed reported "All channel permissions have been reverted to default."

Three UI strings claimed permissions were being applied. All were false and are now corrected to say the owner sets them.

## If you are asked to automate this again

Get an explicit decision first, and treat it as high risk:

- Writing overwrites across every channel is slow, rate-limited, and hard to undo.
- The bot cannot distinguish overwrites it created from ones the owner created, which is exactly how the destructive bug happened. Any future implementation must record what it wrote before it can safely remove anything.
- `required: ['verifyChannelId', 'verifiedRoleId']` in [[interval-db-guards]]'s sibling registry (`src/config/features.js`) deliberately does **not** include channel permissions — they are not config the bot owns.

**Why:** The owner's instruction was direct: owners do the permissions themselves. Honest copy plus no code beats code that silently lies and occasionally deletes their setup.
