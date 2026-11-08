---
'@tanstack/start-plugin-core': patch
---

fix: Rsbuild dev with React Server Components includes stylesheet links in SSR again. The client and server compile concurrently, so the server's manifest module is now rebuilt once the client build is available, as in production builds.
