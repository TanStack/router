---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
---

The warnings about declarations that stay in the route module now offer only fixes that work when applied. The call that keeps a declaration also names the declarations it reads that the same call keeps, and each fix moves them together. Two effectful declarations two split options need are offered a module of their own or the annotation, instead of a reordering that only swaps which one stays. An object an extracted export and split code share is offered a module of its own; an export reading such an object names it. Two registries written with each other are offered the move only. A `let` nothing assigns is offered `const`. A split option assigning a `let` that stays for its initialiser's side effects is offered the `@__PURE__` annotation on that initialiser.
