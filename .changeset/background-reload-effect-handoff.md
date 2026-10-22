---
'@tanstack/router-core': patch
---

Fix stale-while-revalidate loader results being discarded when another navigation starts right away, such as a navigation from an effect of the revealed route or a child navigation immediately after a same-route navigation
