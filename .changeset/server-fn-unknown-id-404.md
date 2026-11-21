---
'@tanstack/start-plugin-core': patch
---

Respond with a 404 instead of a 500 when a request names a server function id that does not exist or is not callable from the client, such as an id from a previous deployment.
