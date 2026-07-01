---
'@tanstack/router-core': patch
---

fall back to client-side rendering when SSR bootstrap data is missing during hydration

`hydrate()` previously threw `Invariant failed` (crashing the whole app through the error boundary) when `window.$_TSR` or `window.$_TSR.router` was absent. That data can legitimately be missing when the streamed HTML is truncated or the inline bootstrap script never runs — aborted navigations, crawlers, in-app webviews, and CSP/extension-blocked inline scripts. Hydration now bails out and lets the client render from scratch (the Transitioner runs `router.load()` on mount when no SSR state is present) instead of taking down the page.
