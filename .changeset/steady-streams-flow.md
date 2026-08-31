---
'@tanstack/router-core': patch
'@tanstack/router-ssr-query-core': patch
'@tanstack/react-router': patch
'@tanstack/react-router-ssr-query': patch
'@tanstack/solid-router': patch
'@tanstack/solid-router-ssr-query': patch
'@tanstack/solid-start-server': patch
'@tanstack/start-client-core': patch
'@tanstack/start-server-core': patch
'@tanstack/start-static-server-functions': patch
'@tanstack/vue-router': patch
'@tanstack/vue-router-ssr-query': patch
'@tanstack/vue-start-server': patch
---

Stream large deferred SSR hydration payloads through a backpressure-aware router transport, fail known setup errors before response creation, and close cancelled or expired transforms safely.

Start now cancels discarded middleware and HEAD response bodies, including plain streams and derived branches.

Server-function raw streams share one ordered response. Arbitrary or sequential consumption can require potentially unbounded buffering of unread data on the client. Cancelling one raw stream discards it locally, while aborting the whole call cancels the response and server work. Consume streams concurrently, cancel unused streams promptly, or use separate calls when independent backpressure is required.

The JSON wire shape of a `RawStream` server-function argument changed. Clients and servers must run matching versions for requests that pass a `RawStream`.

Solid SSR now emits one document type and renders late lazy errors through route boundaries. A Solid `<Await>` without a `fallback` no longer holds the streamed shell; it renders inside the nearest `<Suspense>` boundary like React and Vue, and now renders falsy resolved values.

Static server functions decode cached `RawStream` values with the client deserializer plugins.

SSR Query integrations now keep request cleanup and stream ownership aligned with the router lifecycle.
