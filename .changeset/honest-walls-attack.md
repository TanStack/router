---
'@tanstack/start-server-core': patch
'@tanstack/start-storage-context': patch
---

Skip request middleware bookkeeping when no request middleware is configured, and stop copying serialization adapters when the router adds none.

Server route handlers and route middleware now receive the router's decoded pathname, the same one used for route matching. Characters that would change how the path is read, such as `%2F`, `%3F`, and `%23`, stay encoded.
