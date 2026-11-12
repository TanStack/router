---
'@tanstack/router-plugin': patch
---

The server-code check of Start's client builds also covers the route options Start removes from the client (`server`, `headers`, `ssr`): if a compiler bug ever kept one in a client module, the build fails with an internal compiler error instead of shipping it.
