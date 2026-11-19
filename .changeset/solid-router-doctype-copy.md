---
'@tanstack/solid-router': patch
---

`renderRouterToStream` writes the document type as its own chunk instead of copying the first renderer chunk into a new buffer, so a page rendered as one chunk is no longer held in memory twice.
