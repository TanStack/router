---
'@tanstack/start-plugin-core': patch
'@tanstack/start-server-core': patch
---

Answer `404` instead of an unhandled `500` when a server function is requested with an id that is not in the build's manifest. Every build mints new server function ids, so caches, crawlers and tabs that have not reloaded keep calling ids from a previous deployment, and each one was surfacing as an unhandled server error with a full stack trace. The generated resolver now flags that specific case, the request handler answers `404` and logs the unresolved id outside production, and every other resolution failure keeps its current behaviour. On the client, a call to a stale id now rejects with an error instead of resolving with the serialized `500` body.

Two more paths that still answered `500` now answer `404` as well, so an unknown id and a server-only id are indistinguishable to a client and the id can't be enumerated: the resolver's client-referenced check (a server-only function called with `origin: 'client'`) and the dev-mode id validator (`validateServerFnIdVirtualModule`), which previously threw an unflagged `Invalid server function ID` error and made dev disagree with production.
