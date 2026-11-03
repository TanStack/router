---
'@tanstack/start-client-core': minor
'@tanstack/start-plugin-core': minor
'@tanstack/react-start': minor
'@tanstack/solid-start': minor
'@tanstack/vue-start': minor
---

Experimental: Support route modules in TanStack Start. A module that depends on the Start framework package gets `createServerFn`, `createMiddleware` and `createStartModule` in its generated route scope. It declares the context it requires from the application by augmenting `StartModuleRequirements`, keyed by its package name, with `requestContext` and `functionContext`; the declaration emits no JavaScript. A module that contributes serialization adapters or middleware exports a fragment created with `createStartModule` from `start.ts`, and applications install the generated list with `createStart(() => ({ extends: startModules }))`; the application's own entries run first and entries are deduplicated by identity. The generated `startModules.gen.ts` type-checks that the application installs every fragment and provides the required context. The Start plugin lists module routes in the routes manifest, selects the providers' client tree views for client builds, discovers prerenderable module pages and extends import protection to installed module packages.
