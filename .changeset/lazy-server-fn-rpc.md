---
'@tanstack/start-client-core': patch
'@tanstack/router-core': patch
---

Keep the server function RPC client and its serializer out of the initial client bundle for apps that define no server functions.
