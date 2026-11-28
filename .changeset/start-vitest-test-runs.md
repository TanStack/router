---
'@tanstack/start-plugin-core': minor
'@tanstack/react-start': minor
'@tanstack/solid-start': minor
'@tanstack/vue-start': minor
'@tanstack/router-plugin': minor
'@tanstack/router-generator': minor
---

Start's Vite plugin can be used in a Vitest config. When Vitest resolves the config to run tests, the plugin compiles the code as it does in the app (`createServerFn`, `createIsomorphicFn`, `createServerOnlyFn`, `createClientOnlyFn`, the server-only route options), for the client in browser mode and in jsdom or happy-dom, and for the server in the Node environment. It does not set up the app's dev server, preview server or build.

- A project needs no router entry and no routes. A package that only uses Start's compile-time APIs used to fail with "Could not resolve entry for router entry".
- The route tree is generated once, when Vitest starts, and only for a project with a router entry and a routes directory. It is not regenerated while Vitest watches.
- A test run never writes route files: a route file with an outdated route path and an empty route file are left as they are, with a warning.
- A module that calls `createFileRoute`, `createRootRoute` or `createRootRouteWithContext` loses its `server`, `ssr` and `headers` options in client code even when the route generator does not know the module.
- It needs Vitest 5.1.1 or later. Before, Vitest's translation of the wildcards in `resolve.noExternal` missed a package name with a dash, so in a project that installs Start from the registry, jsdom, happy-dom and Node tests ran `@tanstack/start-client-core` without the Start compiler.

For this, `Generator` of `@tanstack/router-generator` takes `writeRouteFiles: false`, and `tanstackRouterGenerator` and `tanStackRouterCodeSplitter` of `@tanstack/router-plugin/vite` take options for the plugin that embeds them.
