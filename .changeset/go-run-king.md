---
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
---

Fix redirected pending route transitions so lazy target routes can finish loading without stale redirected matches causing render errors.
