---
'@tanstack/start-plugin-core': patch
---

Prerendering now uses Vite's `root` when it is not the working directory (`vite build <dir>`, `createBuilder({ root })`): the preview server starts from `root`, and the server and client build outputs are resolved against it instead of `process.cwd()`.
