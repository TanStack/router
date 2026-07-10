---
'@tanstack/start-plugin-core': patch
---

fix(start-plugin-core): merge user `router.plugins` into Start's generator plugins instead of overwriting them

`tanstackStart({ router: { plugins: [...] } })` was dropping user generator plugins because Start built its internal plugin list after spreading `routerConfig`, which clobbered the user's `plugins` key. User plugins are now appended after Start's internals (vite + rsbuild).

Fixes #7768.
