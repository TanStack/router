---
'@tanstack/start-client-core': patch
'@tanstack/start-server-core': patch
---

Server route handlers receive the raw string path params from the URL again, and their `params` type now says so. `params.parse` output is no longer applied to handler params, so a `params.parse` that throws (including `notFound()`) no longer turns server route requests into 500 errors. Handlers can call `next()` to let the router render the page with parsed params.
