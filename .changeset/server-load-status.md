---
'@tanstack/router-core': patch
'@tanstack/start-server-core': patch
---

Keep server routers pending until every active load settles, including same-URL reloads, overlapping loads, and loads started by lifecycle callbacks.

Wait for active server loads before capturing hydration state and honor redirects that complete during that wait.

Fail SSR when any active server load throws, including a lifecycle-started load whose returned promise the application catches. Preserve early hints before custom dehydration hooks; a hook-started load may emit additional hints, and a later redirect cannot retract hints already sent.
