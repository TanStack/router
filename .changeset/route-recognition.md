---
'@tanstack/router-generator': patch
'@tanstack/router-plugin': patch
---

The route generator and the code splitter recognise route files the same way: a file is split only when the generator lists it and its `Route` is the router's own `createFileRoute`, `createLazyFileRoute`, `createRootRoute` or `createRootRouteWithContext` call for that kind of file, imported from the configured framework's router package (an aliased import counts). A file the generator doesn't list, or a `Route` made by a helper the app imports, is served as written.

- The generator repairs a root constructor in a route file to `createFileRoute(path)`, and `createFileRoute` or `createLazyFileRoute` in `__root` to `createRootRoute`, as it repairs `createLazyFileRoute` in a route file.
- A route id that isn't a string literal builds with a warning; it failed route generation and the build. A route id with a type assertion (`'/x' as const`) is a literal the generator keeps in sync; it failed route generation too.
- A route file whose `Route` the code splitter can't read builds unsplit with a warning that names the cause and the call to write: the options call missing, a constructor imported as a type only, a root constructor called the wrong way (`createRootRouteWithContext<Ctx>()({ … })` for the context form), a call wrapped, made inside a function of the file or stored in another `const`, a route made with `createRoute`, a `Route` declared by a destructuring (`export const { Route } = …`, left out of the route tree before) or declared twice (a build error before). A route made inside a function of the file (an app's route factory) was split and threw at runtime. Under TanStack Start the warning says that the route's `server`, `ssr` and `headers` options ship to the client.
- Under TanStack Start, while route generation has never succeeded (a dev server started with a route file that doesn't parse), a module that exports `Route` fails with the generator's error, instead of being served as written with its `server` code. Once generation succeeds, it is compiled as a route again.
