---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
---

A split route option value that assigns or writes module state when it loads (`component: (n = 5, () => …)`) stays in place when any other code reads that state when the module loads, also from another split chunk or a module two chunks share (`not-split:ordered-effect`). Before, a reader in a shared module could import the state from the component's chunk while that chunk imported the shared module, and loading the component first threw `Cannot access 'n' before initialization`.
