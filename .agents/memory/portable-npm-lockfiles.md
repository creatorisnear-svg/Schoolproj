---
name: Portable npm lockfiles
description: Prevents Koyeb build failures caused by Replit-only npm package URLs in committed lockfiles.
---

Committed npm lockfiles must not contain Replit-internal package-firewall URLs; Koyeb's build environment cannot resolve that private hostname. Keep dependency tarball resolution on the public npm registry so `npm ci` works outside Replit.

**Why:** A Koyeb build failed during `npm ci` because the lockfile referenced `package-firewall.replit.local`; replacing those URLs with `registry.npmjs.org` made the clean install and deployment work.

**How to apply:** Before pushing a Node.js project for Koyeb deployment, search the lockfile for `package-firewall.replit.local` and normalize any matches to public npm registry URLs.
**Regressed and re-fixed Sep 2026.** The same 15 direct dependencies were back on `http://package-firewall.replit.local/npm/...`, almost certainly because the lockfile was regenerated inside Replit. Koyeb failed with `buildpacks build step exit code 51` and production silently froze on the Aug 14 build for roughly three weeks — the bot stayed up on the old image, so nothing looked broken from Discord's side.

**Detecting the freeze without Koyeb access:** `curl https://severe-daryl-officialplaystation5-0f1738f5.koyeb.app/api/public/changelogs` shows the newest version actually running, and a 404 on a route you know you shipped (e.g. `/ready`) proves the instance predates that commit. Compare against `changelog-next.json` before assuming a push deployed.

**The rewrite:** `sed -i 's|http://package-firewall\.replit\.local/npm/|https://registry.npmjs.org/|g' package-lock.json`. Integrity hashes stay valid — the proxy serves byte-identical tarballs — so only the `resolved` lines change. Re-check with `grep -c package-firewall.replit.local package-lock.json` after any lockfile regeneration on Replit.
