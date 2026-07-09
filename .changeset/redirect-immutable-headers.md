---
'@tanstack/start-server-core': patch
---

fix(start-server-core): merge pending set-cookie headers into `Response.redirect()` without throwing

`Response.redirect()` returns a response whose headers are immutable per spec, so merging pending event cookies into it crashed the request with `TypeError: Headers are immutable`. The merge now copies the response when its headers can't be modified, so redirects returned from handlers keep their cookies instead of turning into a 500.

Fixes #7755.
