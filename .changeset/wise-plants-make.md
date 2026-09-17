---
'@tanstack/router-core': patch
'@tanstack/start-server-core': patch
---

Restrict automatic SSR canonical URL redirects to GET and HEAD requests so following a redirect cannot replay writes from a server handler. Explicit application redirects are unchanged.
