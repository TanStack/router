---
'@tanstack/solid-router': patch
'@tanstack/solid-router-devtools': patch
'@tanstack/solid-router-ssr-query': patch
'@tanstack/solid-start': patch
'@tanstack/solid-start-client': patch
'@tanstack/solid-start-server': patch
---

Bump solid-js and @solidjs/web to ^2.0.0-rc.16 and @solidjs/vite-plugin to ^3.0.0-next.51 across the monorepo (with @solidjs/babel-plugin 2.0.0-rc.16 for the webpack path and the `@rsbuild/plugin-solid` compiler overrides), and raise the Solid packages' solid-js / @solidjs/web peer floors to 2.0.0-rc.16. @solidjs/vite-plugin 3.0.0-next.51 peer-requires rc.16 and no longer adds a `$$moduleUrl` export to SSR entry chunks, which Cloudflare Workers rejected (solidjs/solid-vite-plugin#423).

Bump @tanstack/solid-query to ^6.0.0-rc.5 and move @tanstack/solid-query-devtools off its exact 6.0.0-rc.1 pin to ^6.0.0-rc.5; every solid-js export the rc.5 devtools import exists in rc.16.

`<Await>` no longer renders its children with `undefined` data while hydrating a streamed deferred promise. seroval has already settled the promise by then, but `defer()` only records the result in a `.then` callback, so `<Await>` now reads seroval's synchronous status markers when the deferred state is still pending.
