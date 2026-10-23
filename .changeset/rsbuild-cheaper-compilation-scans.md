---
'@tanstack/start-plugin-core': patch
---

Reduce per-compilation work in Rsbuild by reading route and hydration metadata in one module scan, and by skipping schema validation for modules without server function metadata.
