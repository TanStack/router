---
'@tanstack/start-plugin-core': patch
---

`serverFns.generateFunctionId` now receives the server function's stable key (its export or variable name, e.g. `greetUser`) as `functionName` instead of the generated handler name (e.g. `greetUser_createServerFn_handler`). Custom generators keyed on the old `_createServerFn_handler`-style names must be updated; otherwise they no longer match and fall back to the default ids.
