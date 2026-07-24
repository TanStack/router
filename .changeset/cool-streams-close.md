---
'@tanstack/router-core': patch
---

fix(router-core): stop `createRequestHandler` from cleaning up SSR state while the response body is still streaming

When a handler callback returned a plain `Response` wrapping a stream produced by `transformStreamWithRouter` — the contract of `renderRouterToStream` up to v1.169.0 — `createRequestHandler`'s `finally` block ran `serverSsr.cleanup()` immediately, while the body was still streaming. That wiped the render-finished and serialization-finished listeners mid-flight: integrations like `@tanstack/react-router-ssr-query` never closed their dehydration query stream, the transform never received its completion signals, and the response hung until the ~60s serialization timeout (#7529).

The stream transform now claims cleanup ownership when it attaches (`serverSsr.claimCleanup()`), and `createRequestHandler` skips its fallback cleanup when claimed — the transformed stream already cleans up when consumed, cancelled, errored, or when its lifetime expires. `onRenderFinished` listeners registered after the stream fast path is reserved are also no longer dropped.
