---
'@tanstack/router-utils': patch
'@tanstack/start-plugin-core': patch
---

An exported value only a split route option reads, whose initialiser runs a function of the route file declaring a server function (`export const x = [Panel()]`, `export const y = keep(Panel)`, `keep(() => { const fn = createServerFn()… })`), stays in the route module in the server build: Start moves that server function to the module top level there, and the value's own module would have read it before the route module defined it (the server render showed `undefined` where the source gives a function, a hydration mismatch, or the server bundle failed to load). The client build still moves the value out with its split code. The build's `eager-export:reads` warning about it no longer names the compiler's generated binding (`tsrServerFn$…`).
