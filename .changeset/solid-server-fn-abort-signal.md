---
'@tanstack/solid-start': patch
---

Support per-call AbortSignals for Solid server functions. solid-js 2.0.0-rc.4 added the per-call invocation channel (`invoke(fn, { signal }, ...args)`) and moved server function id resolution from the `X-Server-Function` header to the request url pathname; the client rpc now rides that channel when a `signal` is passed to a server function, and the server handler resolves/normalizes ids via the url. The previously skipped abort e2e tests are re-enabled.
