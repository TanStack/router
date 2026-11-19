---
'@tanstack/solid-router-devtools': patch
'@tanstack/solid-router-ssr-query': patch
'@tanstack/solid-router': patch
'@tanstack/solid-start-client': patch
'@tanstack/solid-start-server': patch
'@tanstack/solid-start': patch
---

Run Solid Start server functions through the Solid 2 server-function runtime, including request handling, serialization, middleware, direct SSR calls, and no-JS forms.

POST server functions now use Solid 2's single-flight transport to return updated Router loader and hydration data with the mutation response.
