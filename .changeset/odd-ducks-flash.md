---
'@tanstack/start-server-core': patch
---

Return 400 Bad Request for malformed percent-encoded request pathnames before running server entry callbacks. Preserve valid encoded paths and query handling.
