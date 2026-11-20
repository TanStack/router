---
'@tanstack/start-plugin-core': patch
---

Release each environment's Start compiler when its build bundle closes. `vite build` builds the client, SSR and server environments once each in one process, so the compiler kept from an earlier environment, and the finished module graph its load/resolve closures held, stayed in memory for the rest of the build and could push large apps past the heap limit.
