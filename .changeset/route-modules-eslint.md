---
'@tanstack/eslint-plugin-router': minor
---

Experimental: Add the `route-module-imports` rule, enabled in the recommended configs: files of a route module must import routing and Start APIs from the module's generated route scope, and must not import, in values or in types, from a module the package lists in `uses`. The rule only applies to packages that declare `tanstack.router.module`.
