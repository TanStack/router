---
'@tanstack/router-core': patch
---

prevent isServer exports from being transformed to top-level vars so rspack can dead-code eliminate them
