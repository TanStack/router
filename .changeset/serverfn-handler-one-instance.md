---
'@tanstack/router-utils': patch
'@tanstack/start-plugin-core': patch
---

With the SSR environment as the server-function provider, a server function's handler shares its module's state and classes with the rest of the module: a class the handler instantiates passes `instanceof` in server code, and state the module or a validator writes is what the handler reads (#8656). Handlers still load lazily, on the first call.
