---
'@tanstack/start-server-core': patch
'@tanstack/router-core': patch
---

chore: bump to h3 v2 rc 20

`requestHandler` now translates the `URIError` thrown by `new H3Event(request)` on malformed percent-encoded request paths (e.g. `/%80`, `/%FF`, `/%E0%A4`) into a 400 Bad Request response. Previously these inputs caused an uncaught error that surfaced as a 500.

`getCookies()` return type narrows to `Record<string, string | undefined>` matching the corrected h3 v2 rc.20 type. Runtime behavior is unchanged.
