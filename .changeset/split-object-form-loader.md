---
'@tanstack/router-plugin': patch
---

Split the `handler` of a loader written inline in object form (`loader: { handler, staleReloadMode }`) into its chunk, keeping the other loader options in the route module, so that a split object-form loader loads its data. An object-form loader passed by reference (`const loader = { handler }`, then `loader`) is not supported yet.
