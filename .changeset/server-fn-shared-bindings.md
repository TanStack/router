---
'@tanstack/start-plugin-core': patch
'@tanstack/router-utils': patch
---

Share module-level bindings between a server function's handler and the rest of its module on the server. A class, cache or counter declared next to a server function is now one instance for the handler and for other server code, so serialization adapters registered for such a class match the values the handler returns.
