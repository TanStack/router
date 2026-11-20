---
'@tanstack/router-core': patch
'@tanstack/start-server-core': patch
---

Keep shared SSR stream transforms on Web Streams so Solid Start can use Cloudflare's narrow `nodejs_als` compatibility flag. Remove the unused Node pipeable adapter exports; React keeps its existing Node conversion at the renderer boundary.
