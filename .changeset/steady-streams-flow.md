---
'@tanstack/router-core': patch
'@tanstack/router-ssr-query-core': patch
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/solid-start-server': patch
'@tanstack/start-client-core': patch
'@tanstack/start-server-core': patch
'@tanstack/vue-router': patch
'@tanstack/vue-router-ssr-query': patch
'@tanstack/vue-start-server': patch
---

Stream large deferred SSR hydration payloads through a backpressure-aware router transport, fail known setup errors before response creation, and close cancelled or expired transforms safely.

Start now cancels discarded middleware and HEAD response bodies, including plain streams and derived branches.

Server-function raw streams now use bounded transport backpressure instead of buffering unread raw data on the client.

Solid SSR now emits one document type, preserves blocking Await values, and renders late lazy errors through route boundaries.

SSR Query integrations now keep request cleanup and stream ownership aligned with the router lifecycle.
