---
'@tanstack/router-core': patch
---

A server router that runs `load()` more than once starts each load from fresh match state. Before, a match that turned `ssr: false` was sent with the previous load's status and error, a route's `ssr` function saw the previous load's `ssr` results of child matches, and a failing `head` kept the previous load's head tags and response headers.
