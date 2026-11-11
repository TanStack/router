---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
---

The warnings about declarations that stay in the route module now offer only fixes that work when applied: the call that keeps a declaration also names the declarations it reads that the same call keeps (`declare \`helper\`, \`columns\` after \`Route\``); two effectful declarations two split options need are offered a module or the annotation instead of a reordering that only swaps which one stays; an object an extracted export and split code share is offered its own module; an export reading such an object names it; two registries written with each other are offered the move only; a `let`nothing assigns is offered`const`; and a split option assigning a `let`that stays for its initialiser's side effects is offered`/_ @**PURE** _/` on that initialiser.
