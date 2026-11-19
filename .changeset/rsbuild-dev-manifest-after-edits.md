---
'@tanstack/start-plugin-core': patch
---

Rsbuild dev: pages link the preloads and stylesheets of the current client build after an edit. After an edit that added an import of a module in a chunk of its own, a CSS import or a new route, server-rendered pages kept linking what the dev server's first client build emitted until a restart (missing preloads and styles).
