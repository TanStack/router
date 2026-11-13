---
'@tanstack/router-utils': patch
---

The warning for an export that stays in the route module because it reads, when it loads, a binding the route module keeps offers a move that works: it names what the export and that binding read when the module loads (a binding that one reads, a holder, a function it calls) and the code writing them then; when that move would need the route itself, the warning says why it stays instead.
