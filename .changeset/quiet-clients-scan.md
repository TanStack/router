---
"@tanstack/start-plugin-core": patch
---

Prebundle RPC serialization dependencies before the first Vite client render so late dependency discovery does not reload the page with mixed React module instances.
