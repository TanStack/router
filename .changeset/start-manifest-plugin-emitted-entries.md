---
'@tanstack/start-plugin-core': patch
---

Identify the client entry chunk by matching its facade module against the resolved client entry path instead of asserting the client bundle contains exactly one entry chunk. Plugins may legitimately emit additional entry-flagged chunks into the client build — vite-plugin-solid >= 3.0.0-next.6 emits a facade chunk per dynamically imported project module — which previously failed the build with "multiple entries detected".
