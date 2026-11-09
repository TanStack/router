---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

Code splitting reads more of the code the way it runs:

- `/* #__NO_SIDE_EFFECTS__ */` before a `const` declaration of a function (`/* #__NO_SIDE_EFFECTS__ */ const makeSchema = (…) => …`, also before or after `export`) counts, as in Rollup and esbuild, not only before the initialiser.
- A function invoked where it is written is recognised through `as`, `!`, `satisfies` and `.call`/`.apply`/`.bind(…)(…)`, so what it reads as the file loads stays in the route module. A block-bodied arrow function followed by a line starting with `(`, without a semicolon, is no longer taken for a call.
- A class with a decorator on a constructor or method parameter is an effect, as one with a class or member decorator: it keeps its order with the effects after it.
