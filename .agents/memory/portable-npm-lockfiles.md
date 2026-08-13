---
name: Portable npm lockfiles
description: Prevents Koyeb build failures caused by Replit-only npm package URLs in committed lockfiles.
---

Committed npm lockfiles must not contain Replit-internal package-firewall URLs; Koyeb's build environment cannot resolve that private hostname. Keep dependency tarball resolution on the public npm registry so `npm ci` works outside Replit.

**Why:** A Koyeb build failed during `npm ci` because the lockfile referenced `package-firewall.replit.local`; replacing those URLs with `registry.npmjs.org` made the clean install and deployment work.

**How to apply:** Before pushing a Node.js project for Koyeb deployment, search the lockfile for `package-firewall.replit.local` and normalize any matches to public npm registry URLs.