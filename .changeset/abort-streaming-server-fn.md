---
'@tanstack/start-client-core': patch
---

Fix a streaming server function hanging on the client after its request is aborted. A framed response that fails mid-stream logged the error but left the async iterables Seroval had materialized from earlier records pending, so a `for await` over an aborted stream never ended or threw. Those streams are now rejected with the transport error, so the consumer observes the `AbortError`.
