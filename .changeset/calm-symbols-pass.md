---
'@tanstack/router-core': patch
---

Compare and copy plain objects in `replaceEqualDeep` by their string keys only, skipping the symbol-key lookup that dominated key enumeration. Objects with non-enumerable own properties, or symbol keys on the incoming value, now pass through untouched instead of being structurally shared.
