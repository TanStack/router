---
'@tanstack/router-core': patch
---

Hand a superseded navigation's pending background reloads to the navigation that replaces it, so a stale-while-revalidate result is no longer discarded when the revealed route navigates again from an effect
