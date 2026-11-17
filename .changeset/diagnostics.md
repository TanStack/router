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
