---
'@tanstack/router-core': patch
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
'@tanstack/react-start': patch
'@tanstack/solid-start': patch
'@tanstack/vue-start': patch
'@tanstack/router-ssr-query-core': patch
'@tanstack/react-router-ssr-query': patch
'@tanstack/solid-router-ssr-query': patch
'@tanstack/vue-router-ssr-query': patch
---

Pass the private source location separately from navigation options across Links, loader navigation, and redirects. Use one stable destination snapshot for React Link rendering and preloading while keeping click navigation options current.

Require matching router versions in SSR Query integrations so redirects can pass their captured source to both resolution and navigation.
