---
'@tanstack/start-plugin-core': patch
---

A Vite dev server without HMR (`server.hmr: false`, as Vitest runs one) now tells the Start compiler about file changes: a module whose import stopped (or started) being a server function factory was served from its old compile until the server restarted.
