---
'@tanstack/router-core': patch
---

Reimplement `replaceEqualDeep` with temporary key lists for resolved children. Speed up equal arrays and shared array prefixes while retaining recursive sharing of changed children and consistent signed-zero behavior. Correctly remove previous symbol properties and keep sparse arrays with extra keys and built-in objects with an own `constructor` opaque.
