---
'@tanstack/router-plugin': minor
'@tanstack/router-generator': patch
'@tanstack/start-plugin-core': minor
'@tanstack/start-client-core': patch
'@tanstack/start-fn-stubs': patch
---

Report compiler patterns that used to be skipped silently.

The router plugin warns, through the bundler, about route files it leaves unsplit or not hot-updated: a renamed or namespaced route factory, a split route option written as a method, getter, setter or computed key, and split options or codeSplitGroupings spread from another object. The "will not be code-split" warning for exported route options goes through the bundler once per file, in production builds too. A route file that calls createFileRoute more than once, and codeSplitGroupings behind a computed key, fail the compilation with a clear error. Route files whose factory call passes type arguments (`createFileRoute<'/a'>('/a')`) are now transformed.

The Start compiler reports a Start factory use the client compilation cannot rewrite, which ships its implementation to the client: a warning in development and an error in builds. `<Hydrate>` rejects split children that use await, yield, the arguments of their component or a hook recognized by its import, and warns in development when its children come from a spread.

In development, the browser reports a Start factory call the compiler missed (`createServerFn().handler()`, `createServerOnlyFn()`, `createClientOnlyFn()`, `createIsomorphicFn().server()`), including cross-module ones. Production bundles are unchanged.

A disallowed character in square brackets of a route path throws instead of exiting the process, so a dev server keeps running; a build fails on route generation errors.
