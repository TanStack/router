---
'@tanstack/router-core': patch
'@tanstack/start-server-core': patch
---

Reuse the parsed request location during SSR instead of repeating input rewrites. Match server routes against the app router's parsed pathname while preserving encoded pathnames for server handlers and middleware.
