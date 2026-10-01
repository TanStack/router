---
'@tanstack/history': patch
'@tanstack/router-core': patch
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
---

Publish Link updates by their rendering route owner, preserving departing Links' source locations until navigation settles. Cache destinations within each framework binding and scan lightweight activity metadata to avoid recomputing unrelated Links.
