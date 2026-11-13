---
'@tanstack/router-utils': patch
---

The warning for a binding a statement that stays in the route module changes or uses offers a move that works: it names what the moved bindings read when the module loads and the statements writing them then; when that move would need the route itself, the warning says why it stays instead.
