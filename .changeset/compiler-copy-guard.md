---
'@tanstack/router-utils': patch
---

The compiler now fails the compile with an internal compiler error, positioned at the change it would lose, when it would copy part of a module into an output without a change it planned there (a compiler bug: such a copy could ship code the change replaces, such as a server implementation in a client chunk). Before, the output was emitted without that change and no message was printed.
