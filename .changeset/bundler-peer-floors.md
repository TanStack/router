---
'@tanstack/start-plugin-core': minor
'@tanstack/react-start': minor
'@tanstack/solid-start': minor
'@tanstack/vue-start': minor
'@tanstack/react-start-rsc': minor
---

Raise Start's bundler peer ranges to the lowest versions Start's test suites pass on: `vite` `>=8.1.0` (8.0.x fails Start's dev and build suites), `@rsbuild/core` `^2.2.13`, the first Rsbuild that requires Rspack 2.2.9, and `@rspack/core` `>=2.2.9` for `@tanstack/react-start-rsc`. Earlier Rspack 2 releases leave dev builds stuck after a rebuild, fail RSC builds, and can report a stale client build after a server component's CSS edit, so the page keeps the old styles (web-infra-dev/rspack#15865). The router plugin's ranges are unchanged: it still supports Rsbuild 1.
