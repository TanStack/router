---
'@tanstack/start-plugin-core': patch
'@tanstack/start-server-core': patch
---

fix(start): emit `<script>` tags for client entry boot siblings under IIFE. When `scriptFormat: 'iife'` and the entry chunk has static-import siblings (e.g. an extracted runtime via `optimization.runtimeChunk: 'single'`), the manifest now carries vlientEntryImports`and`<Scripts />`emits a`<script>` for each before the entry, fixing hydration for IIFE bundles with extracted runtimes.
