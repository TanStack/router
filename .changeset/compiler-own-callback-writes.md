---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
---

A declaration whose call runs its own function writing module state nothing else uses when the module loads (`const C = memo(function Page() { seen.n++ })`, `const getIt = wrap(() => { cache.v = 1 })`) now moves to the split chunk that needs it, as the same function written inline in the route option is split; before, it stayed in the route module with an `eager-split:state` warning.
