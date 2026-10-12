---
'@tanstack/start-server-core': patch
'@tanstack/react-start': patch
'@tanstack/solid-start': patch
'@tanstack/vue-start': patch
---

Keep streaming a page when request middleware returns a response that reads the page body, such as a copy made through a wrapped global `Response`, a copy in Bun, or a body piped through a transform. Start now disposes a replaced page stream only when nothing reads it. `transferResponseBodyOwnership` is removed: return the derived response directly.
