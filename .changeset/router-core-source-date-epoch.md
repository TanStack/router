---
'@tanstack/router-core': patch
---

Honor `SOURCE_DATE_EPOCH` when dehydrating route matches for SSR, so a prerender of the same sources emits byte-identical HTML: when it is set, each match's `updatedAt` in the hydration payload comes from that timestamp instead of the wall clock.
