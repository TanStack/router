---
'@tanstack/router-utils': patch
---

A warning for a value read at load from state the route file writes offers a move that works: it names what the moved code reads when the module loads (a holder, a function it calls), what reads a moved binding before a moved write, and the code assigning a moved binding; when that move would need the route itself, the warning says why it stays instead.
