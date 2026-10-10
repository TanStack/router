---
'@tanstack/start-plugin-core': patch
---

Fix dev SSR style collection to preserve CSS order without duplicating imported styles, while retaining styles from code-split routes. Keep layered imports from inline styles out of the global dev stylesheet. In bundled development, collect styles from a complete client bundle and load compiler dependencies through the bundler to avoid restarting client plugins. Preserve client hydration and reload SSR modules on file changes instead of clearing them on every request.

Support newer Vite bundled dev versions by loading their separate client runtime before hydration and awaiting the client build through the updated environment API.
