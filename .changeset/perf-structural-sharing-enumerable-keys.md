---
'@tanstack/router-core': patch
---

perf: speed up structural sharing (`replaceEqualDeep`) by computing enumerable own keys with `Object.keys` + a length compare instead of `getOwnPropertyNames` followed by a `propertyIsEnumerable` call per key. This runs on every selector result on every state update when `defaultStructuralSharing` is enabled, and is ~1.3–1.5x faster on typical router state objects with identical behavior.
