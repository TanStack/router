---
'@tanstack/router-generator': patch
'@tanstack/router-plugin': patch
'@tanstack/router-utils': patch
---

The route generator and the code splitter now agree on which files are routes. The code splitter splits a file only when the generator lists it and its `Route` is the router's own `createFileRoute`, `createLazyFileRoute`, `createRootRoute` or `createRootRouteWithContext` call for that kind of file, imported from the router package of the configured framework. A file the generator does not list is served as written, also under Start: it is not split and its `server`, `ssr` and `headers` options are not removed. A route made with another framework's router package or a subpath of the router package is left as written too.

The generator now repairs a root constructor in a route file to `createFileRoute(path)`, and `createFileRoute` or `createLazyFileRoute` in `__root` to `createRootRoute`, as it already repairs `createLazyFileRoute` in a route file. It also reads the root route file, and it no longer warns about a route made by the app's own helper.

A route whose `createFileRoute` comes from an app module that re-exports the router's no longer warns or fails the build under Start. Neither does a route factory call other than the route's own. What those calls hold is not code-split, and under Start their server options ship to the client. The warning for a route file whose `Route` is not the router's call now says, under `deleteNodes`, that the listed options are not removed.

Route options, a spread in them and an object-form loader can now be named through several `const`s (`const options = base`) or a cast (`const options = base as any`). They are split and their server options removed as when written inline. An object-form loader named through two consts is no longer exported as the object itself, which the lazy loader then called.
