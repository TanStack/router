---
'@tanstack/start-plugin-core': patch
---

Start's Vite and Rsbuild plugins keep their compiler state per build or dev server instead of per plugin object, so reusing the same plugins is harmless: a second `createBuilder()`/`build()` with the same inline config, or a second `build()` on the same Rsbuild instance, compiles the files as they are now (it used to read the first build's facts of unchanged modules) and its server build is checked against its own client build; a Vite dev server with inline plugins that restarts (`server.restart()`, or Vite's own restart on an `.env` edit) keeps re-planning route modules when the route tree changes.
