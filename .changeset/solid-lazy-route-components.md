---
'@tanstack/solid-router-ssr-query': patch
'@tanstack/solid-router-devtools': patch
'@tanstack/solid-start-client': patch
'@tanstack/solid-start-server': patch
'@tanstack/solid-router': patch
'@tanstack/solid-start': patch
---

`lazyRouteComponent` now delegates to Solid's `lazy()`: SSR'd route chunks
resolve their client assets (stylesheet links, modulepreload hints,
hydration gating) through the client-assets manifest like any other
`lazy()` component. Failed chunk downloads are retried by the next preload
or render (via an interim solid-js patch that stops `lazy()` from caching
rejected module promises, pending upstream), and the module-not-found
reload-once behavior is unchanged.
