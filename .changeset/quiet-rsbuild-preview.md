---
'@tanstack/start-plugin-core': patch
---

Fix Rsbuild preview support for TanStack Start SSR. Preview always installs the SSR middleware; the `installDevServerMiddleware` option only applies to dev.
