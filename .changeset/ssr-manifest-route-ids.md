---
'@tanstack/router-core': patch
---

Route IDs are no longer emitted as URL-like strings in the SSR hydration payload; manifest route keys use the same encoding as match ids.
