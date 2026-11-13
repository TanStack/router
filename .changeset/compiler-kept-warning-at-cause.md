---
'@tanstack/router-utils': patch
---

A code-splitting warning about code that stays in the route module is given once, at the cause. Previously, an export that stayed only because it read a declaration kept for its own reason got the warning instead of that declaration, and the offered fix (moving the export and what it reads) caused an import cycle. When the declaration reads state that the module writes at load, the warning now gives the line of that write and offers a fix that keeps the values: move the declaration, the state and the statements that write them at load into their own module.
