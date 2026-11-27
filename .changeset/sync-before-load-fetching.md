---
'@tanstack/router-core': patch
---

Avoid re-rendering a retained route for a synchronous `beforeLoad`: its match no longer briefly reports `isFetching: 'beforeLoad'` during navigation.
