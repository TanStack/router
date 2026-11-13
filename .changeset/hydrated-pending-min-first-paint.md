---
'@tanstack/router-core': patch
---

fix: a pending component that was server-rendered for an `ssr: false` or `ssr: 'data-only'` route now counts `pendingMinMs` from the page's first contentful paint instead of from hydration, so the content no longer waits the full minimum again after the client JS loads. Without a paint entry, the minimum still counts from hydration.
