---
'@tanstack/router-plugin': patch
---

Split route chunks now import the bindings they share with the route module when the compiled route module was restored from a persistent transform cache, as Vitest 5 does by default. Before, such a chunk declared its own copy of the binding, so state the loader wrote was not visible in the component.
