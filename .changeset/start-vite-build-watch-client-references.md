---
'@tanstack/start-plugin-core': patch
---

`vite build --watch` of a Start app: a server function the client stops importing is no longer callable over HTTP after the rebuild. The server rebuilds when a file of the client's build changes, and its function resolver waits for the client's rebuild of the same edit.
