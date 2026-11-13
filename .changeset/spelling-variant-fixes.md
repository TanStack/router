---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

The compilers read a few more spellings the same way:

- An isomorphic, server-only or client-only implementation in a type wrapper, called where it is written (`createIsomorphicFn().server(impl as any)()`, `createServerOnlyFn(impl as any)()`), compiles to code that parses in its environment.
- A route callback reading `this` stays in the route module with a warning (`not-split:this-reference`) wherever it is declared: in a `const` the option names, through `const`s naming each other, as a function declaration, or as the `handler` of a loader object a `const` holds. It was split, and the lazy wrapper called it without `this`.
- `codeSplitGroupings` is read through `const`s naming each other (`const chosen = groupings`), not only through one.
- Production source maps of Vite builds (Rollup and Rolldown) name every output of a route file by its path: a split chunk, a shared module, an extracted export or a server function's module no longer names its source `route.tsx?tsr-split=…`, so devtools show one file, breakpoints set in it bind, and error trackers group by it. Queries the compiler does not own stay, and an app's own `sourcemapPathTransform` still runs.
