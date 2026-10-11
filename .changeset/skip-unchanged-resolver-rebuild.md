---
'@tanstack/start-plugin-core': patch
---

Skip the server function resolver rebuild in Rsbuild dev when the resolver has not changed, so most edits no longer rebuild the whole server chunk graph.
