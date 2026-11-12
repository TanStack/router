---
'@tanstack/router-plugin': patch
---

Code splitting: a `loader` configured for splitting whose value the compiler cannot read (an import, a call, a conditional: anything that is not a function or an object literal in the route file, through its consts) is no longer split. It may be an object-form loader (`{ handler, staleReloadMode }`), whose options the router reads from the route module before a split chunk could load, and whose chunk the router then called as a function ("is not a function"). The loader stays in the route module, and the build warns, naming the file, with the fixes: write the loader in the route options (`loader: { handler, … }`), or call the function from one written there (`loader: (ctx) => myLoader(ctx)`). Loaders that are functions written in the route file are split as before.

In a loader object, a spread written after `handler` (or a computed key) may replace the handler: such a loader stays in the route module with a warning to put the spread before `handler`. With the spread before it (`loader: { ...options, handler }`), the handler is split and the route module keeps the options. A loader naming a const object with no `handler` the compiler can see (`const l = { ...base }`) stays in the route module, as the same object written inline does.
