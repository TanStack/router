---
'@tanstack/router-core': patch
---

Fix an infinite SSR redirect loop when a custom search serializer writes characters such as `,` or `%20` that the server normalizes before the router sees the request.
