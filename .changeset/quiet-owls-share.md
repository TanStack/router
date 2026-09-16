---
'@tanstack/router-core': patch
---

Allocate the `replaceEqualDeep` result only at the first difference, so structural sharing of search, params, state and loader data no longer allocates when the new value is deeply equal to the previous one.
