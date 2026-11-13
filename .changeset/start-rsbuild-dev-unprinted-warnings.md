---
'@tanstack/start-plugin-core': patch
---

Rsbuild dev: Start's warnings of a compilation that a newer one replaced before Rsbuild printed it (a cold start without `routeTree.gen.ts`, whose client compiles again once the generator writes it) are printed with the newer one: import protection's mock-mode reports and the compiler's warnings were lost from the terminal.
