---
'@tanstack/solid-router': patch
'@tanstack/solid-router-devtools': patch
'@tanstack/solid-router-ssr-query': patch
'@tanstack/solid-start': patch
'@tanstack/solid-start-client': patch
'@tanstack/solid-start-server': patch
---

Bump solid-js and @solidjs/web to ^2.0.0-rc.13 (and @solidjs/vite-plugin to ^3.0.0-next.46), and raise the Solid peer floors to 2.0.0-rc.13.

@tanstack/solid-router moves off Solid's internal `sharedConfig` and the raw `_$HY` registry onto the public hydration API rc.13 ships (solidjs/solid#3718): `useHydrated` reads `isHydrating()`; the native SSR match transfer writes through `getHydrationWriter()` gated on `isHydratable()`, so it now respects `<NoHydration>`; and the client boot takes each match's entry with `takeHydrationValue()`.
