---
'@tanstack/router-core': patch
'@tanstack/vue-router': patch
---

detect Safari's "not a valid JavaScript MIME type" error as a missing lazy chunk, so stale-deploy recovery also reloads when the server answers the chunk with an HTML fallback
