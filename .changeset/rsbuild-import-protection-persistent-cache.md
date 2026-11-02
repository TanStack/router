---
'@tanstack/start-plugin-core': patch
---

Fix Rsbuild import protection failing to resolve its mock modules when Rspack's persistent cache restores the modules that import them.
