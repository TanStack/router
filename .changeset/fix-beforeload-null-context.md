---
'@tanstack/router-core': patch
---

fix(router-core): treat null return from beforeLoad as no-op for route context

When `beforeLoad` returns `null`, it is now treated the same as `undefined` (no-op) instead of being stored as `__beforeLoadContext: null`. This is consistent with how the `context` route option already handles null returns via `?? undefined`, and prevents null from silently interfering with context accumulation.

Fixes #7110
