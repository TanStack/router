---
'@tanstack/start-plugin-core': patch
---

Start (Vite): prune server-only routes from the generated route tree during the upfront client dependency scan and skip pre-bundling bare package specifiers that only resolve under server export conditions, preventing `vite dev` dependency scanning from failing when server routes or `createServerFn` handlers import Node-only packages.
