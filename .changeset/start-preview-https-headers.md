---
'@tanstack/start-plugin-core': patch
---

`vite preview` with HTTPS: server-rendered pages no longer answer 500 (`res.setHeaders is not a function`) over HTTP/2, which browsers use. Responses that set several cookies send all of them, and responses to requests that accept gzip no longer carry extra headers named `0`, `1`, and so on.
