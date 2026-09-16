---
'@tanstack/router-core': patch
---

Split `replaceEqualDeep` into an equality scan and a copy phase: arrays and objects are scanned by dedicated loops up to the first difference, matching keys prove ownership without a `hasOwnProperty` lookup, and once a difference is found the result is built without any further equality bookkeeping. Deeply equal search, params, state and loader data are recognised faster and changed values are copied with less work per entry.
