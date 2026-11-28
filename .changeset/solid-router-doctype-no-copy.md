---
'@tanstack/solid-router': patch
---

`renderRouterToStream` renders the document type with the shell instead of prepending it to the first stream chunk, so a page rendered as one chunk is no longer held in memory twice.
