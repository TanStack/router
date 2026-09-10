---
'@tanstack/start-server-core': patch
---

Fix `setResponseHeaders` to iterate `Headers` entries, replace existing values, and preserve separate `Set-Cookie` values.
