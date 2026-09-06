---
'@tanstack/start-plugin-core': patch
---

Detect a runnable SSR environment structurally so the dev server middleware is still installed when the plugin and the dev server resolve different copies of vite, and warn instead of silently skipping the middleware when no environment can server render. Previously such a setup fell through to Vite's default handler and served `Cannot GET /` with no diagnostic, and opting in via `installDevServerMiddleware: true` threw `the SSR environment is not a RunnableDevEnvironment` for an environment that was in fact runnable.
