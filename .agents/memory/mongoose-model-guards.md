---
name: Mongoose Model Guards
description: All model files need mongoose.models guard to prevent OverwriteModelError; EmergencyCall uses named import pattern.
---

## Rule
Every model in `src/models/` must use the guard pattern to prevent OverwriteModelError on any module re-evaluation.

**Standard pattern (mongoose object import):**
```js
export default mongoose.models.Name || mongoose.model('Name', schema);
// or for named exports:
const X = mongoose.models.Name || mongoose.model('Name', schema);
```

**Named import pattern (EmergencyCall.js):**
```js
import { Schema, model, models } from 'mongoose';
export default models.Name || model('Name', schema);
```

**Why:** The bot+portal run in the same Node.js process. Multiple handlers use dynamic `await import()` calls across the codebase. Without the guard, any unexpected module re-evaluation causes OverwriteModelError crashes.

**How to apply:** When adding a new model, always use the guard. To batch-fix existing models, run the Python script pattern: `re.sub(r'= mongoose\.model\(\'(\w+)\'', ...)` and `re.sub(r'export default mongoose\.model\(\'(\w+)\'', ...)`.

**Models already fixed (June 2026):** All 37 models in src/models/ — Announcement, AuthorizedUser, AutoJoin, AutoRole, BOLO, CADCharacter, CADConfig, Changelog, CivilianJobConfig (was already guarded), Config, DispatchConfig, EconomyBalance, EconomyConfig, EconomyInventory, EconomyStore, EmergencyCall (named import), FeatureFlag, JobAssignment (was guarded), MemberMovementConfig (was guarded), OfficerStatus, PendingVerification, PremiumKey, PreviewVideo, Priority, PriorityRequest, ReactionRole, RoleRequest, RoleRequestConfig, RoleplayCalendar, RoleplayCommands, Staff, StatusHeartbeat, Sticky, Strike (2 models), StripeConfig, Ticket, TicketConfig, TrafficTicket, Verification, Welcome.
