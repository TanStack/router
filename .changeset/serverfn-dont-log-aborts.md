---
'@tanstack/start-client-core': patch
---

fix(start): don't log an aborted server function request as an error

`serverFnFetcher` logged every non-`Response` error before rethrowing, including the `AbortError` thrown when the caller cancels the request (e.g. TanStack Query aborting a query when its component unmounts). Cancellation is expected control flow, so it is no longer logged. Genuine errors are still logged, and all errors are still rethrown so callers can handle them.
