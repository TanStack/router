---
'@tanstack/router-core': patch
---

Detect plain objects by constructor instead of `Object.prototype.toString` dispatches in `isPlainObject`, which gates every `deepEqual` and `replaceEqualDeep` recursion step. Object literals, `JSON.parse` output and null-prototype objects are still plain; objects from another realm no longer are. Records with an own `constructor` key (for example the search params of `?constructor=foo`) fall back to a prototype check, so they keep structural sharing while class instances stay opaque.
