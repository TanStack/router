---
'@tanstack/start-plugin-core': patch
'@tanstack/start-server-core': patch
---

fix(start): emit client entry scripts from the root route manifest. When `scriptFormat: 'iife'` and the entry chunk has static-import siblings (e.g. an extracted runtime via `optimization.runtimeChunk: 'single'`), the manifest now includes those async siblings before the async client entry in root route scripts, fixing hydration for IIFE bundles with extracted runtimes.
