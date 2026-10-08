---
'@tanstack/router-plugin': patch
---

Split the `handler` of a loader written in object form (`loader: { handler, staleReloadMode }`) into its chunk, keeping the other loader options in the route module, so that a split object-form loader loads its data.
