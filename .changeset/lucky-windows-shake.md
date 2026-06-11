---
'@tanstack/solid-router': patch
---

Fix hydration mismatch for `ssr: false` routes with a `pendingComponent`. The suspense fallback is now skipped only while hydrating server-rendered markup, so selective SSR routes hydrate cleanly while client-side navigations keep showing their pending component.
