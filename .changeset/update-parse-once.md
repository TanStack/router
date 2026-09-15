---
'@tanstack/router-core': patch
---

Parse the location once when `router.update()` changes the basepath or rewrite, collect `invalidate()` match ids in a single pass, and specialize internal basepath composition without arrays or loops. Preserve basepath case sensitivity when creating and updating the router.

Rebuild server route trees when `caseSensitive` changes and reuse the server cache only when the route tree and case sensitivity both match.
