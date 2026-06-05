---
'@tanstack/router-core': patch
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
---

Fix search middleware composition so `retainSearchParams` does not restore search params that a downstream `stripSearchParams` removed.
