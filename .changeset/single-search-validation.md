---
'@tanstack/router-core': patch
---

Navigations no longer re-run every matched route's `validateSearch` an extra time just to compute `buildLocation`'s `fromSearch`, and each match allocates one accumulated search object instead of three, so apps with real search schemas (zod/valibot) spend less time validating search params per navigation.
