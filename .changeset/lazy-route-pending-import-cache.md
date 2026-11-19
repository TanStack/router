---
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
---

fix: on the server, `lazyRouteComponent` now reuses a resolved module instead of a pending import, so a cancelled Cloudflare Worker request can no longer leave later SSR of that route hanging
