---
'@tanstack/router-generator': patch
'@tanstack/router-plugin': patch
'@tanstack/router-utils': patch
'@tanstack/start-plugin-core': patch
---

The route generator now gives a route file the constructor of its kind (`createFileRoute`, `createLazyFileRoute`) also when its route id is not a string literal; it still reports the id. Before, the code splitter waited for that repair, and a Start build shipped the route's `server` code to the client.

While route generation has never succeeded (a dev server started with a route file that does not parse), a module that exports a `Route` fails to compile with the generator's error, as the route tree does, instead of being served as written with its `server` code. Once generation succeeds, it is compiled as a route again.

The warning for a route file whose `Route` is not the router's own call now names its cause: the options call missing, a constructor imported as a type only, a root constructor called the wrong way (with `createRootRouteWithContext<Ctx>()({ … })` for the context form), or a call wrapped, made in a function of the file or stored in another const, with the call of the file's kind to write (`createLazyFileRoute` in a lazy file). A route made by the app's own helper (imported from another module) is no longer reported, whatever else the file imports from the router package, and the generator tells whether a call is the router's constructor by its import, not its name. Route options in a reassigned `let` are reported as such.

An object-form loader with only a `handler` whose object is written to later (`a.staleReloadMode = …`) is no longer split down to its handler, which dropped the option written later; it stays in the route module, with a warning.
