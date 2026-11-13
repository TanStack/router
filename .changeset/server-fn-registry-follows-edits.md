---
'@tanstack/start-plugin-core': patch
---

On the Vite dev server, a server function an edit removes is no longer registered: calling it by its old id fails like any unknown id instead of reaching a module that no longer exports it.
