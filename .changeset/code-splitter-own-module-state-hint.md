---
'@tanstack/router-plugin': patch
---

The warning for a split option writing a binding other code uses now offers "in a module of its own that also exports the functions writing it" instead of "in its own module": a split chunk assigning a `let` it imports from that module would assign a read-only import.
