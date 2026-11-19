---
'@tanstack/solid-start-client': patch
---

Render deferred hydration boundaries immediately on client navigation, without depending on a Link or ClientOnly component having mounted earlier. Use the boundary's actual hydration context to decide whether to preserve server HTML.

Keep the `never()` fallback visible on client-only mounts.
