---
'@tanstack/router-ssr-query-core': patch
---

Drop the hydration stream reader instead of calling `releaseLock()`, which can deadlock WebKit's garbage collector and freeze the page.
