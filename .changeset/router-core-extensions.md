---
'@tanstack/router-core': minor
'@tanstack/react-router': minor
'@tanstack/solid-router': minor
'@tanstack/vue-router': minor
'@tanstack/start-client-core': patch
'@tanstack/react-start-rsc': patch
---

Declarations emitted by packages that use the router now import router types from the framework package, for example `@tanstack/react-router`, instead of `@tanstack/router-core`, which pnpm does not let those packages resolve unless they depend on it. The framework packages augment the new `@tanstack/router-core/extensions` entry instead of `@tanstack/router-core`, and the router packages export router-core's `Route` interface, which `createFileRoute` returns, as `RouteCore`. Existing augmentations of `@tanstack/router-core` keep working.
