---
'@tanstack/start-static-server-functions': patch
---

Fix `staticFunctionMiddleware` failing with `Unexpected token '<', "<!DOCTYPE "... is not valid JSON` when no prerendered cache file exists for a call. The client now treats an unreadable or non-JSON cache response as a miss and invokes the server function instead, and a cache hit is reused from the client cache rather than refetched.
