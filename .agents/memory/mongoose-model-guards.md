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

**Verified September 2026:** All 58 models in `src/models/` carry the guard. Re-audited every registration line, including the two-line `export default mongoose.models.X || mongoose.model(...)` wrap used by the Appy/Business/JobAssignment models, and the one out-of-tree registration in `scripts/add-changelog.js`. The earlier "37 models" figure was a June 2026 snapshot; 21 models have been added since and every one of them was already guarded. Re-count before trusting a number here — the stale count caused a later session to hunt for a bug that did not exist.
