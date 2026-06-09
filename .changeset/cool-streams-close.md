---
'@tanstack/router-core': patch
---

fix(router-core): run `onRenderFinished` listeners registered after the stream fast path is reserved

When `reserveStreamFastPath()` had already set `streamFastPathReserved = true`, a subsequently registered `onRenderFinished` listener was silently dropped. This broke SSR streaming with `@tanstack/react-router-ssr-query`: the dehydration query stream was never closed, so the response hung until the serialization timeout (~60s). The listener is now registered regardless; the fast path still calls `setRenderFinished()` when the app stream ends, so it fires at the correct time.
