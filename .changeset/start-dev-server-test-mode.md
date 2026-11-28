---
'@tanstack/start-plugin-core': patch
---

fix: the Start dev server serves the app when Vite runs in the `test` mode. `vite dev --mode test` answered `404 Cannot GET /`, because the dev server installed no middleware in that mode. A Vitest run does not need that anymore: Start leaves its dev server plugins out of it.
