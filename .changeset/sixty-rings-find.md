---
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
---

Compute hash-sensitive Link active states and inherited or function-derived hash hrefs from the server's empty hash during hydration. Use the live hash after hydration and immediately for client-only mounts, without a hydration update for ordinary links.
