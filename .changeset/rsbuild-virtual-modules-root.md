---
'@tanstack/start-plugin-core': patch
---

Rsbuild: Start writes its virtual modules under the app's root, not the working directory. An app built or served from another directory (`rsbuild build --root <app>` from a monorepo root) no longer fails with "Module not found" on the packages they import, such as RSC's serialization adapters.
