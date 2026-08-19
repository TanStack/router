---
'@tanstack/solid-router-ssr-query': patch
'@tanstack/solid-router-devtools': patch
'@tanstack/solid-start-client': patch
'@tanstack/solid-start-server': patch
'@tanstack/solid-router': patch
'@tanstack/solid-start': patch
---

`lazyRouteComponent` now delegates to Solid's `lazy()` using its `{ export }`
option (solid-js 2.0.0-rc.1): the module namespace passes through untouched,
so SSR'd route chunks resolve their client assets (stylesheet links,
modulepreload hints, hydration gating) through the client-assets manifest,
and hydration claims the component synchronously from the preloaded module.
Failed chunk downloads are retried by the next preload or render, and the
module-not-found reload-once behavior is unchanged. Solid packages are
bumped to the 2.0.0-rc.1 line (`@solidjs/vite-plugin` 3.0.0-next.30).
