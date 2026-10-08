---
'@tanstack/router-core': patch
'@tanstack/history': patch
---

Commit memory-history navigations in Node. Only skip `navigate`/`commitLocation` for `createServerHistory()` or `isServer: true`.
