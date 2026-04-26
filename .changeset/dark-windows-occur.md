---
'@tanstack/solid-start': patch
---

Don't externalize `@tanstack/solid-query` during SSR to avoid duplicate `QueryClientContext` instances
