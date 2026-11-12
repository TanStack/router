---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
---

The warnings about code that stays in the route module name the real cause (the statement and its line, a binding the route module keeps, or the split outputs that share it) and offer only fixes that work when applied: each offered fix is checked by a test that applies it.
