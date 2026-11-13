---
'@tanstack/start-plugin-core': patch
---

fix: the Rsbuild RSC integration skips falsy entries in a rule's `use` array (Rspack's conditionally disabled loaders) instead of treating them as loaders.
