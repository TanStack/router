---
'@tanstack/router-core': patch
---

Avoid re-running hash scrolling after SSR hydration when later preload or invalidate cycles resolve without a location change.
