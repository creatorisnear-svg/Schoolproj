---
name: Voice UDP Bypass — Never Remove
description: A synthetic UDP bypass in voiceListener.js must never be removed; it's required for voice to work on Replit.
---

# Voice UDP Bypass — Never Remove

**File:** `src/utils/voiceListener.js`

Discord voice servers never reply to UDP from Replit (inbound blocked). `@discordjs/voice`'s `performIPDiscovery()` hangs forever without this bypass.

**How it works:** The bypass intercepts `net.stateChange` at code 2 and emits a synthetic 74-byte fake IP discovery response.

**Without it:** Voice connections hang at `connecting` forever on Replit.

**Note:** Outbound TTS UDP works fine — only inbound is blocked by Replit's network.

**Also:** `@discordjs/voice` must stay ≥ `0.19.2` for DAVE (Discord Audio/Video E2E Encryption) support — older versions get rejected with close code 4017. `@snazzah/davey` is a required peer dependency.

**Why:** This is a Replit-specific network limitation that will never be "fixed" upstream. The bypass is intentional and permanent.
