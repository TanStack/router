---
'@tanstack/start-plugin-core': minor
'@tanstack/react-start': minor
'@tanstack/solid-start': minor
'@tanstack/vue-start': minor
'@tanstack/react-start-rsc': minor
'@tanstack/router-plugin': minor
---

Raise the bundler peer ranges to the lowest versions the compiler's test suites pass on: `vite` `>=8.1.0` (8.0.x fails Start's dev and build suites), `@rsbuild/core` `^2.2.13`, the first Rsbuild that requires Rspack 2.2.9 (earlier Rspack 2 releases leave dev builds stuck after a rebuild and fail RSC builds), and `@rspack/core` `>=2.2.9` for `@tanstack/react-start-rsc`. The router plugin's Rsbuild range no longer includes Rsbuild 1.
