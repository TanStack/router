---
'@tanstack/vue-router': patch
---

Fix Link hydration when the client URL has a fragment. Match the server's empty hash for initial active state and inherited or function-based hash hrefs, then update to the client hash after hydration. Client-only mounts continue to use the live hash immediately.
