---
'@tanstack/start-server-core': patch
---

Apply route path parameter parsers, including parent-route parsers, before invoking server route handlers so runtime parameters agree with their inferred types.
