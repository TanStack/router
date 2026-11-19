---
'@tanstack/solid-router': patch
'@tanstack/solid-router-devtools': patch
'@tanstack/solid-router-ssr-query': patch
'@tanstack/solid-start': patch
'@tanstack/solid-start-client': patch
'@tanstack/solid-start-server': patch
---

Bump solid-js and @solidjs/web to ^2.0.0-rc.9 and @solidjs/vite-plugin to ^3.0.0-next.44 across the monorepo (with @solidjs/babel-plugin 2.0.0-rc.9 for the webpack path). @solidjs/vite-plugin 3.0.0-next.44 peer-requires solid-js ^2.0.0-rc.9 and ships the rc.9 compiler.

rc.9 changed `serverFunctionUrl` to describe a `GET()` reference's own call (`serverFunctionUrl(fn, ...args)`) and moved the id-based form-post address to `serverFunctionActionUrl` / `parseServerFunctionActionUrl` (solidjs/solid#3440); @tanstack/solid-start's server-function handler now uses those.

Rsbuild apps: `@rsbuild/plugin-solid@2.0.0-rc.0` hard-pins the rc.6 compiler, which emits the old delegated-event key (`el.$$click`) that the rc.9 runtime no longer reads (`_$$click`), so delegated handlers never fire. Until the plugin ships an rc.9-based release, override its `@solidjs/compiler` and `@solidjs/babel-plugin` to 2.0.0-rc.9 (the monorepo does this in `pnpm-workspace.yaml`).
