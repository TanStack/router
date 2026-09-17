---
'@tanstack/solid-router': patch
---

Fall back to the router instance's server flag during development SSR. This prevents router construction from entering client hydration on the server and restores provider-owned loading and match-state serialization.
