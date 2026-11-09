---
'@tanstack/start-plugin-core': patch
---

Vite dev: with a custom `cacheDir` (outside `node_modules/.vite`), Start no longer compiles the dependency optimizer's pre-bundled files as app modules, and reads a pre-bundled dependency's facts from its package entry as it does in the default layout.
