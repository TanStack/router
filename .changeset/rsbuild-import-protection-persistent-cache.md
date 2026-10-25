---
'@tanstack/start-plugin-core': patch
---

Rsbuild: import protection works with Rspack's persistent cache (`performance.buildCache`). A build or `rsbuild dev` restored from the cache no longer fails with `Can't resolve …/import-protection/…/edge.*.mjs`. It reports the same violations, with the same traces, and a restarted dev server reports the violations of restored modules again.
