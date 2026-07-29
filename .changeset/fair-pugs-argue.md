---
'@tanstack/start-plugin-core': patch
---

Fail fast with a clear error when the TanStack Start Vite plugin runs on Vite older than v7. Vite 6 and older never invoke the `buildApp` plugin hook, so builds appeared to succeed while post-build steps such as prerendering and SPA shell (`_shell.html`) generation were silently skipped.
