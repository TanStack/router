---
'@tanstack/router-utils': patch
---

Compiler core fixes from the Astra review:

- A `var` declared inside a top-level statement (`if (…) { var { x } = acquire() }`, a `for` initialiser, a label, an unbraced `if` body) that only removed code read now goes with its initialiser, as on `main`. The initialiser and the import only it read stayed in the client module, so a deleted route option's server-only dependency (`./db.server`) shipped. `TSR_COMPILER_VERIFY=1` now fails a compile that leaves such a declarator behind.
- Two `export *` branches reaching one binding under two names (`export { api as a, api as b }`, an imported binding exported beside a re-export of it, a namespace exported both ways) resolve to that binding instead of an ambiguous name, so `createServerOnlyFn` and the other factories are recognised there and their server code stays off the client (`main` shipped it).
- Removing a declaration keeps the line break that ends the statement before it when that statement's line ends in an annotation comment (`// @__PURE__`) or a no-break space; the build failed with two statements on one line.
- A mixed `export { type T, val }` list whose trailing comment holds a `}` no longer emits invalid code.
- A module of thousands of `const` aliases no longer overflows the compiler's stack.
- A named import spelled `'*'` (`import { '*' as twice }`) is that export, not the module's namespace: it no longer fails the build as an escaping namespace, and a factory exported as `'*'` is recognised.
- A split chunk's copy of an anonymous `export default class` keeps the name `default` while its static initialisers run.
