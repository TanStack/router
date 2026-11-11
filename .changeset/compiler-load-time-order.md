---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

Route code splitting keeps the value a declaration computed when the route module loaded in more cases where only split code reads it. It now stays in the route module (the chunk imports it, a build warning names it) when the function it calls assigns a binding the route module also uses (`function init() { mode = 'ready' }` with `const thing = init()`), when a function it calls reads state written further down the module, and when the state it reads is written by code that runs after its place in the module: an async function invoked where it is written (after an `await`), a generator invoked where it is written, or an instance field initialiser.
