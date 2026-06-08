---
'@tanstack/react-start': patch
'@tanstack/solid-start': patch
'@tanstack/vue-start': patch
'@tanstack/start-client-core': patch
'@tanstack/start-plugin-core': patch
'@tanstack/start-server-core': patch
---

Improve Start response reconciliation, session cookie handling, and server-entry error recovery. Server entries now recover Start error responses with `handleStartError`, response helpers reconcile across server routes, SSR, server functions, redirects, and error responses, and serialized server-function transport headers are protected from helper overrides.
