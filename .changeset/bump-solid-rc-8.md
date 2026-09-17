---
'@tanstack/solid-router': patch
'@tanstack/solid-router-devtools': patch
'@tanstack/solid-router-ssr-query': patch
'@tanstack/solid-start': patch
'@tanstack/solid-start-client': patch
'@tanstack/solid-start-server': patch
---

Bump solid-js and @solidjs/web to ^2.0.0-rc.8 and @solidjs/vite-plugin to ^3.0.0-next.43 across the monorepo (with @rsbuild/plugin-solid ^2.0.0-rc.0 and @solidjs/babel-plugin ^2.0.0-rc.8 for the rsbuild/webpack paths). rc.8 is ESM-only and declares `engines.node >= 22.12`. @solidjs/vite-plugin 3.0.0-next.43 is the first release that honors `resolve.noExternal` patterns when it externalizes the dependencies of packages that consume the Solid runtime (solidjs/solid-vite-plugin#360); on next.41 and next.42, `vite dev` fails for TanStack Start apps with "Package import specifier '#tanstack-router-entry' is not defined".
