---
'@tanstack/router-core': patch
'@tanstack/start-client-core': patch
'@tanstack/start-server-core': patch
'@tanstack/start-plugin-core': patch
'@tanstack/start-static-server-functions': patch
---

Update `seroval` and `seroval-plugins` from 1.6.7 to 1.7.1. This picks up backpressure for streamed async iterables and `ReadableStream` values, `depthLimit` checks in every serializer entry point, and side-effect-free package metadata for better tree shaking.
