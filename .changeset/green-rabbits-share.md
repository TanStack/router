---
'@tanstack/react-start': patch
---

Fix `@tanstack/react-start/server` imports inside React Server Components by adding a `react-server` export condition that resolves to the request/response APIs without pulling in the SSR renderer entrypoints.

This fixes RSC routes that call `createServerFn` loaders and read request headers in dev with `@vitejs/plugin-rsc` enabled.
