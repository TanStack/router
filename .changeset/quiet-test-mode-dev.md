---
'@tanstack/start-plugin-core': patch
---

Serve the app from the Start dev server when Vite runs with `--mode test`. The dev server middleware was skipped in test mode, so `vite dev --mode test` returned `404 Cannot GET /`.
