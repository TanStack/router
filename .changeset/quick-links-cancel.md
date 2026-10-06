---
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
---

Cancel pending link preload timers when starting navigation to avoid redundant preloading while the destination is loading.
