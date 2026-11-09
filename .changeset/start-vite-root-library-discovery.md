---
'@tanstack/start-plugin-core': patch
---

Vite: Start finds the Start libraries it bundles in the SSR build from Vite's root, not the working directory. A `vite build <app>` run from another directory (a monorepo root, a script) no longer leaves them external and uncompiled, where their server fns returned `undefined`.
