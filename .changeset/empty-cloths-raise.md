---
'@tanstack/start-plugin-core': patch
---

Isolate Vite prerender previews in a worker so resources opened by the SSR bundle are released when prerendering finishes.
