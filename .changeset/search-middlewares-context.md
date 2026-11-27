---
'@tanstack/router-core': patch
---

Avoid a per-route context allocation and an empty middleware array on every `buildLocation` call.
