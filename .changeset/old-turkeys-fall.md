---
'@tanstack/router-core': patch
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
---

Make `pathParamsAllowedCharacters` initialization-only. Configure it when creating the router; changing allowed characters requires a new router instance. Remove decoder-update bookkeeping and decoder-change checks from route-owned path caches.
