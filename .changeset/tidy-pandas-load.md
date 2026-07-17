---
'@tanstack/start-plugin-core': patch
---

Preserve exact Vite-resolved module IDs, including virtual prefixes and query variants, when the Start compiler recursively loads imports. Clean IDs only for file-oriented diagnostics and invalidation, and preserve existing query strings when adding compiler-owned lookup flags, so virtual modules such as import-protection mocks reach their plugin load hooks unchanged.
