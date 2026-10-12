---
'@tanstack/start-server-core': patch
---

Let request middleware read the body of a `HEAD` response, and strip it when the response leaves the pipeline. Start no longer applies `Content-Encoding`, `Content-Length`, or other framing headers set through response helpers to error bodies and serialized server-function replies that it builds itself. A response that middleware assigns to `result.response` is now disposed when the middleware returns another response.
