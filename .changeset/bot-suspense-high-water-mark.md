---
'@tanstack/router-core': patch
'@tanstack/react-router': patch
---

Prevent eager upstream stream consumption for bot requests by adding `highWaterMark` support to `transformReadableStreamWithRouter` and setting it to 0 when rendering for crawlers.
