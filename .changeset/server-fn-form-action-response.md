---
'@tanstack/start-server-core': patch
---

Fix a server function used as a form action failing with "It looks like you forgot to return a response from your server route handler" unless its handler returned a `Response`. A native form submission does not send the RPC header, and that path returned the handler's raw value straight to the HTTP layer. Non-RPC callers now receive a serialized `Response`, while a handler-provided `Response` or `redirect()` is still passed through untouched.
