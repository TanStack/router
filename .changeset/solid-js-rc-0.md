---
'@tanstack/solid-router-devtools': patch
'@tanstack/solid-router-ssr-query': patch
'@tanstack/solid-router': patch
'@tanstack/solid-start-client': patch
'@tanstack/solid-start-server': patch
'@tanstack/solid-start': patch
---

Upgrade `solid-js` and `@solidjs/web` to `2.0.0-rc.0`, and migrate from `vite-plugin-solid` to its new name `@solidjs/vite-plugin` at `3.0.0-next.28`

`vite-plugin-solid` was renamed to `@solidjs/vite-plugin`; its final release (`3.0.0-next.27`) is a re-export shim over the new package. `@solidjs/vite-plugin@3.0.0-next.28` requires `solid-js`/`@solidjs/web` `^2.0.0-rc.0`, so the rename and the `rc` bump land together.

`@tanstack/router-plugin` is intentionally untouched: it detects the Solid JSX plugin by its Vite plugin _name_ (`solid`), which the renamed package still registers, and its `vite-plugin-solid` peer is optional — so it keeps working for both Solid 1 and Solid 2 consumers without a change.

Also bumps `@tanstack/solid-query` and `@tanstack/solid-query-devtools` to `^6.0.0-rc.0` (whose peer requires `solid-js >=2.0.0-rc.0`), and converges `@tanstack/query-core` on `5.101.4` — `solid-query` depends on query-core `5.101.0`, which previously resolved to a stale `5.99.0` and produced two incompatible `QueryClient` types.
