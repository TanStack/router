---
'@tanstack/start-server-core': patch
---

Return `406 Not Acceptable` instead of `500 Internal Server Error` when a page route receives a request whose `Accept` header excludes HTML.
