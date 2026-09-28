---
'@tanstack/react-router': patch
'@tanstack/router-core': patch
'@tanstack/history': patch
---

Skip location notifications for fixed-destination React Links in outgoing routes while navigation is pending. Keep presentation state scoped to the mounted route, update retained and dynamic Links immediately, and reuse fixed destination builds. Preserve live selection for hash histories, custom href formatters, and invalidated router options.
