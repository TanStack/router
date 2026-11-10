---
'@tanstack/router-plugin': patch
'@tanstack/router-utils': patch
'@tanstack/start-plugin-core': patch
---

The router plugin's Vite host keeps its compiler state per build run or dev server, as Start's plugins do: a dev server with inline plugins that restarts (`server.restart()`, or Vite's own restart on an `.env` edit) keeps re-planning route modules when the route tree changes, where it used to stop after the old server closed. The route listener of a dev server in middleware mode now also ends when the server closes.
