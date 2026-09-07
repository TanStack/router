---
'@tanstack/router-core': patch
'@tanstack/router-devtools-core': patch
---

Consolidate internal path interpolation into `interpolatePath`, returning a pathname directly and collecting metadata only when requested. Update router and devtools callers without changing route parsing or interpolation caching.
