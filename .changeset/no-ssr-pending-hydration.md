---
'@tanstack/router-core': patch
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
---

Keep the server-rendered pending component of `ssr: false` and `ssr: 'data-only'` routes mounted through hydration instead of mounting a second copy
