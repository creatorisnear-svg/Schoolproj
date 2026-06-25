---
name: Appys Feature Architecture
description: Application system design — models, bot flow, premium gating, dashboard wiring
---

## Models
- `AppyConfig` — per-guild: enabled, reviewChannelId, useWebhook, webhookUrl, panelImageUrl, panelHeader, panelBody, panelChannelId, panelMessageId
- `AppyPanel` — individual application types (typeId uuid, name, description, questions[], acceptRoleId)
- `AppySubmission` — per-submission: submissionId, typeId, userId, username, answers[], status(pending/accepted/denied), reviewMessageId

## Bot Flow
1. Panel embed sent to channel (bot or webhook) with `appy_open` button labeled "Click here for applications"
2. `appy_open` → ephemeral StringSelectMenu of all AppyPanel types for that guild
3. `appy_type_select` → check pending, check premium, start DM Q&A (in-memory session Map<userId, {typeId, guildId, questionIndex, answers, timeout}>)
4. DM replies handled in `messageCreate` when `!message.guild` → `handleDMReply`
5. Completed → save AppySubmission → post to reviewChannelId with Accept/Deny buttons
6. `appy_accept_${submissionId}` / `appy_deny_${submissionId}` → update status, DM user, assign role if configured, edit review message

## Premium Gating
- Added `'appys'` to `DEFAULT_PREMIUM_FEATURES` array in `src/website/routes/api.js`
- Feature toggle route uses `checkFeatureAccess` which checks this list
- Dashboard `isFlagPremium('appys')` shows Premium badge on the feature toggle

## DM Session
- In-memory Map in `appyHandler.js` — sessions lost on restart (acceptable)
- 10-minute timeout auto-cancels and DMs user
- Re-apply blocked via AppySubmission query for pending status

**Why:** Multiple application types per guild share one panel button to keep the Discord channel clean. Each type has its own role and questions — no cross-contamination on accept.
