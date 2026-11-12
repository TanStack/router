---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
---

An exported `let` that only split code uses now moves into its own module together with the code assigning it (a setter function, exported or not, or a statement assigning it when the module loads), instead of staying in the route module with a warning when the setter wasn't exported. The route file re-exports it, so other modules importing it still read its current value.
