---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/router-generator': patch
'@tanstack/start-plugin-core': patch
'@tanstack/react-start-rsc': patch
---

Compiler and route generator messages:

- Files are named relative to the project root, with one position (line and column, from 1) and a `[tanstack-router]` or `[tanstack-start]` prefix, on every host. On Rsbuild, Rspack and webpack the position is the compilation's own location, so the terminal and the error overlay point at it (`File: ./src/fns.ts:3:28`, `WARNING in ./src/routes/index.tsx 2:22`) instead of `:1:1`.
- Invalid `codeSplitGroupings` fail the module at the value, naming the option. Invalid `codeSplittingOptions` fail with one readable error naming each option instead of a raw schema dump.
- Start's refusals say what to write instead, at the right position: a refused server function names its position, or the local it reads, with the fix (`.validator()` and `{ data }`); a builder kept in an object or assigned after its declaration gets the documented fix. Refusals in a Vue single-file component are reported at the SFC's line and column, in builds and on the dev server, on Vite and Rsbuild.
- The client stubs of the RSC helpers no longer recommend a route loader, and their explanation is development-only.
- A plugin that gives a route file different text under different module ids gets a warning.
- Internal checks: a client build fails with an internal compiler error, naming the file and the position, if a client module would hold server code (a server function's handler or validator, a middleware's or an isomorphic function's server implementation, a `createServerOnlyFn` body, a route option `deleteNodes` lists), or if an output would copy part of a module without a change the compiler planned there. These mean a compiler bug: please report them.
- A warning about how a module is written is for whoever can edit it: an installed package's module (`node_modules`) no longer gets advice for its author (a middleware factory's parameter read in `.server()`, an exported or `this`-using route option, a server compile's parse failure), and an error in one names the package to update or report. Warnings that server code reaches the client, import protection and the package warnings stay.
- Vite dev: the warning about a package that uses Start names the package and its manifest, not Vite's pre-bundle (`node_modules/.vite`), and gives a package that declares Start but that the app does not list the right remedy. In a pre-bundle holding several packages, each package a Start call is in gets its own warning (a kit that only imports the router gets none), wherever the app keeps Vite's `cacheDir`. A pre-bundle is installed code there too: no advice for its author, and its errors name the package; a workspace package the app pre-bundles keeps its author's advice. A pre-bundle another plugin edits before Start's transform names no package.
- `start-server-param` says what the browser can see and where secrets go, at the parameter: "Only server code reads `descriptor`. Arguments at calls included in client code can be visible to the browser. Public labels are fine. Read secrets inside `.server()`."
- A route option whose value the route file exports is reported at the export (the declaration of the first one listed), with how to split it: "`Page` stays in the route module because src/routes/x.tsx exports it. To split it, remove its export, or move it to another module and import it here."
- A route the compiler does not recognise (a wrapped route call, …) is reported once in a Start app, and says only what applies: a root route is not called not code-split, and a wrapped route a build does nothing to (a root or lazy route file without Start) is not reported. In a Start app, every router warning comes from the client's compile of the file.
- A spread of route options is reported as what it may hold: "If the spread holds `ssr`, `server` or `headers`, they stay in client code".
- A route option whose value is a server function written in place is no longer reported as not code-split: the client splits it (only the server's module keeps it).
- Hydrate's refusals of `this`, `super`, `new.target`, `await`, `yield` and a private name of the enclosing class point at the use, not the `<Hydrate` tag.
- An invalid generator option (`quoteStyle`, `target`, …) fails with one error naming the option and `tsr.config.json` when it is a source, instead of a raw schema dump; an invalid `tsr.config.json` names the file. The `experimental.enableCodeSplitting` and route group errors are printed once.
- An internal compiler error reaches the user as one: "Internal compiler error in src/x.tsx. Please report it at https://github.com/TanStack/router/issues with this file and the detail below.", the detail after it.
- Rsbuild, Rspack and webpack print a Start compile message with `[tanstack-start]`; a call by an unknown server function id answers "Server function info not found for <id>. If the page loaded before the server changed, reload it." on every host (Vite dev said "Invalid server function ID"); the import-protection marker conflict names the first marker as `src/x.ts:1:8`; the generator's missing root route names the file to add.
- The RSC client's `<CompositeComponent>` and `RscNodeRenderer` errors are tagged `[tanstack-start]` in development and compact in production.
