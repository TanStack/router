---
'@tanstack/start-client-core': patch
'@tanstack/start-server-core': patch
---

Preserve server function failures when a handler or middleware throws or rejects with a falsy value, including undefined, null, false, 0, and an empty string. Browser-deserialized server functions now unwrap results and reject failures like direct calls. Successful returns, including middleware's returned falsy error fields, stay successful. Existing Error failures retain their wire format and HTTP status.
