---
'@tanstack/start-server-core': patch
---

Keep response context headers on non-2xx server function responses. h3 only
merges the response context into 2xx responses, so headers set through
`getResponseHeaders`/`setResponseHeader` were dropped on errors and redirects.
Non-2xx responses now receive the same merge rules h3 applies to 2xx ones
(`set-cookie` appended, everything else set), and responses with immutable
headers are rebuilt instead of mutated.
