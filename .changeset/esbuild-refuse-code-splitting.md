---
'@tanstack/router-plugin': patch
---

The esbuild plugin now throws when `autoCodeSplitting` is enabled, and `TanStackRouterCodeSplitterEsbuild` throws, instead of silently bundling every route without splitting. Route generation with esbuild is unchanged.
